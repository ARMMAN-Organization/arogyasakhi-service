import { addDays } from '@armman/core';
import {
  badRequest,
  conflict,
  decryptPii,
  encryptPii,
  forbidden,
  hashForSearch,
  notFound,
  normalizeForSearch,
  unprocessable,
  type AuthenticatedUser,
} from '@armman/service-commons';
import type {
  BeneficiaryRiskConditionSummary,
  BeneficiaryStatusHistory,
  Prisma,
} from '../../../../node_modules/.prisma/client-beneficiary-service';
import type {
  BeneficiaryStatus,
  CasePhase,
  CaseType,
  CcvOpeningRiskState,
} from './beneficiary.constants';
import { buildSearchTokens, evaluateDuplicateMatch } from './beneficiary.duplicate-detection';
import { computeBmi, withDecryptedName } from './beneficiary.mapper';
import type { BeneficiaryListFilters, BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';
import type { UpsertRiskConditionSummaryInput } from './dto/upsert-risk-condition-summary.dto';
import type { SummaryQueryInput } from './dto/summary-query.dto';
import type { UpsertSocioDemographicsInput } from './dto/upsert-socio-demographics.dto';
import {
  resolveHealthBlockIdFromPhc,
  resolvePadaUnits,
  resolveVillageNames,
} from '../geography/geography.client';
import { resolveLookupIdsByValueCode, resolveLookupValues } from '../lookups/lookup.client';
import {
  getSakhiName,
  listSakhiIdsForSupervisor,
  listSakhiNamesForSupervisor,
} from '../sakhi/sakhi.client';
import { resolveProjectNames } from '../projects/project.client';
import { resolveRiskConditions } from '../risk-conditions/riskCondition.client';
import { resolveLatestVisitVitals } from '../visits/visitVitals.client';
import {
  isStillbirthOutcome,
  resolveDeliveryOutcomesBySlot,
} from '../visits/deliveryOutcomes.client';

/**
 * Maps each socioDemographics *LookupId field to the lookup_categories
 * category_code it reads from (see socioDemographicsSchema in
 * create-beneficiary.dto.ts for the category assignments). Both education
 * fields (self/partner) read the same EDUCATION_LEVEL category — the form
 * asks the same question twice, once per person.
 */
const SOCIO_DEMOGRAPHICS_LOOKUP_CATEGORIES: Record<string, string> = {
  phoneOwnerLookupId: 'PHONE_OWNER',
  mobileNetworkAvailabilityLookupId: 'MOBILE_NETWORK_AVAILABILITY',
  educationLevelLookupId: 'EDUCATION_LEVEL',
  partnerEducationLevelLookupId: 'EDUCATION_LEVEL',
  partnerOccupationLookupId: 'PARTNER_OCCUPATION',
  migrationPatternLookupId: 'MIGRATION_PATTERN',
  monthlyIncomeLookupId: 'MONTHLY_INCOME_BRACKET',
  religionLookupId: 'RELIGION',
  socialCategoryLookupId: 'SOCIAL_CATEGORY',
};

/**
 * Strips the "LookupId" suffix and resolves each socioDemographics field to
 * its human-readable {categoryCode, valueCode, label} — e.g.
 * religionLookupId -> a sibling `religion` key. Non-lookup fields
 * (yearsInVillage, familyMembersCount, childrenUnder5Count) are left as-is.
 * A missing/unresolvable value (or no socioDemographics row at all) never
 * fails the whole response — the case/PII/other detail is still valid data.
 */
async function withResolvedSocioDemographics<T extends Record<string, unknown>>(
  caseDetail: T,
  authorizationHeader: string,
): Promise<T> {
  const socio = caseDetail.socioDemographics as Record<string, unknown> | null | undefined;
  if (!socio) return caseDetail;

  const requests: Record<string, { categoryCode: string; lookupValueId: string | null }> = {};
  for (const [field, categoryCode] of Object.entries(SOCIO_DEMOGRAPHICS_LOOKUP_CATEGORIES)) {
    requests[field] = { categoryCode, lookupValueId: (socio[field] as string | null) ?? null };
  }

  const resolved = await resolveLookupValues(requests, authorizationHeader);

  const withResolved = { ...socio };
  for (const field of Object.keys(SOCIO_DEMOGRAPHICS_LOOKUP_CATEGORIES)) {
    const resolvedKey = field.replace(/LookupId$/, '');
    withResolved[resolvedKey] = resolved[field];
  }

  return { ...caseDetail, socioDemographics: withResolved };
}

/**
 * Resolves each riskConditionSummaries entry's riskConditionId to a display-
 * ready conditionCode/conditionName/gradeScale via risk-referral-service
 * (the owner of risk_conditions — no cross-service joins, per this service's
 * forklift rule). Ids are deduped before the batch call. An id with no
 * matching ACTIVE row (retired condition, or a stale id) leaves that entry's
 * three fields `null`.
 *
 * If risk-referral-service is unreachable or errors, this degrades to
 * leaving every entry's fields `null` rather than failing the whole
 * `GET /beneficiaries/:id` request — the beneficiary's own case/PII/risk-flag
 * data is still valid and more load-bearing than the condition's display
 * name. The failure is logged so it's visible without paging anyone.
 */
async function withResolvedRiskConditionNames<T extends Record<string, unknown>>(
  caseDetail: T,
  authorizationHeader: string,
): Promise<T> {
  const risks = caseDetail.riskConditionSummaries as Record<string, unknown>[] | undefined;
  if (!risks || risks.length === 0) return caseDetail;

  const ids = [...new Set(risks.map((r) => r.riskConditionId as string))];

  let resolved: Map<string, { conditionCode: string; conditionName: string; gradeScale: string }>;
  try {
    resolved = await resolveRiskConditions(ids, authorizationHeader);
  } catch (err) {
    console.error(
      `Failed to resolve risk condition names for ids [${ids.join(', ')}] — ` +
        'returning riskConditionSummaries with null conditionCode/conditionName/gradeScale.',
      err,
    );
    return caseDetail;
  }

  const withNames = risks.map((r) => {
    const match = resolved.get(r.riskConditionId as string);
    return {
      ...r,
      conditionCode: match?.conditionCode ?? null,
      conditionName: match?.conditionName ?? null,
      gradeScale: match?.gradeScale ?? null,
    };
  });

  return { ...caseDetail, riskConditionSummaries: withNames };
}

/**
 * Maps `riskLevel` to a display color. This is a convention introduced here
 * — no color mapping exists anywhere else in the codebase — not a
 * confirmation of an existing backend rule. Kept as a pure function of
 * `riskLevel` (not its own independent grade-scan) so it can never disagree
 * with the riskLevel badge computed alongside it.
 */
function riskLevelToColor(
  level: 'none' | 'mild' | 'moderate' | 'high',
): 'GREEN' | 'YELLOW' | 'RED' {
  switch (level) {
    case 'mild':
    case 'moderate':
      return 'YELLOW';
    case 'high':
      return 'RED';
    default:
      return 'GREEN';
  }
}

/**
 * Aggregates `riskConditionSummaries` down to one overall `riskLevel` badge
 * for the whole case — the worst (highest-severity) grade among all
 * conditions wins, same "any SEVERE anywhere -> high" rule
 * `findByIdsWithRisk`/`getByIdsWithRisk` already use for the pada
 * visit-list's badge, just computed here from the full summary list instead
 * of a single pre-picked "worst" row. Reuses `gradeToRiskLevel` so this
 * detail-view badge and the list-view badge can never drift out of sync. A
 * case with no risk-condition-summary rows (or only ungraded ones,
 * latestGrade null) is `'none'`. `riskColor` is derived 1:1 from the
 * resulting `riskLevel` — see `riskLevelToColor`.
 */
function withOverallRiskLevel<T extends Record<string, unknown>>(caseDetail: T): T {
  const risks = caseDetail.riskConditionSummaries as { latestGrade: string | null }[] | undefined;
  if (!risks) return caseDetail;

  const RISK_LEVEL_RANK = { none: 0, mild: 1, moderate: 2, high: 3 } as const;
  let riskLevel: 'none' | 'mild' | 'moderate' | 'high' = 'none';
  for (const r of risks) {
    const level = gradeToRiskLevel(r.latestGrade);
    if (RISK_LEVEL_RANK[level] > RISK_LEVEL_RANK[riskLevel]) riskLevel = level;
  }

  return { ...caseDetail, riskLevel, riskColor: riskLevelToColor(riskLevel) };
}

const GESTATION_DAYS = 280;

/**
 * Collapses RISK_GRADE's 6 values to the 4-bucket riskLevel the pada
 * visit-list screen's badge uses — see BeneficiaryService.getByIdsWithRisk.
 */
function gradeToRiskLevel(grade: string | null): 'none' | 'mild' | 'moderate' | 'high' {
  switch (grade) {
    case 'MILD':
      return 'mild';
    case 'MODERATE':
      return 'moderate';
    case 'SEVERE':
    case 'HIGH':
    case 'CRITICAL':
      return 'high';
    default:
      return 'none';
  }
}

/**
 * Enforces the same scoping `list()` applies to reads on a single-case
 * mutation: a SUPERVISOR may only touch a case belonging to their own Sakhi
 * roster; MANAGER/ADMIN are unscoped. Throws forbidden() otherwise. Callers
 * without a SUPERVISOR/MANAGER/ADMIN role never reach these mutations
 * (blocked by requireRoles at the route), so SAKHI is not handled here.
 */
async function assertCallerCanTouchCase(
  caseSakhiId: string,
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Promise<void> {
  if (!caller.roles.includes('SUPERVISOR')) return;
  if (!caller.projectId) {
    throw forbidden('Supervisor caller has no project scope.');
  }
  const roster = await listSakhiIdsForSupervisor(caller.projectId, caller.id, authorizationHeader);
  if (!roster.includes(caseSakhiId)) {
    throw forbidden("This beneficiary case is outside this Supervisor's roster.");
  }
}

/**
 * Enriches a page of `GET /beneficiaries` rows with display-ready
 * sakhiName/projectName/villageName — beneficiary_cases/pii stores only the
 * bare ids (no cross-service joins, per this service's forklift rule), but
 * the Supervisor-monitoring/Manager-listing UI needs names without a
 * follow-up call per row.
 *
 * sakhiName is resolved from `supervisorRoster` when the caller already
 * fetched one for scoping (SUPERVISOR path in list()) — no extra round-trip
 * in the common case. Otherwise (MANAGER/ADMIN, or any sakhiId missing from
 * a passed roster) each distinct sakhiId not already covered is resolved
 * with a deduped per-id `getSakhiName` fallback call, capped at the page's
 * unique Sakhi count. projectName/villageName always come from one
 * dedicated list call each (see resolveProjectNames/resolveVillageNames) —
 * both are small, mostly-static datasets with no filter-by-id support.
 *
 * A name that can't be resolved (stale/deleted Sakhi, project, or village)
 * is `null`, never a failed request — the beneficiary case itself is still
 * valid data. An empty page skips every lookup call entirely.
 */
async function enrichListPage(
  items: Record<string, unknown>[],
  authorizationHeader: string,
  supervisorRoster?: Map<string, string>,
  skipSakhiNameLookup = false,
): Promise<Record<string, unknown>[]> {
  if (items.length === 0) return [];

  const sakhiIdOf = (item: Record<string, unknown>) => item.sakhiId as string;
  const projectIdOf = (item: Record<string, unknown>) => item.projectId as string;
  const villageIdOf = (item: Record<string, unknown>) =>
    (item.pii as { villageId: string | null }).villageId;

  // A SAKHI caller only ever sees their own cases (list() forces
  // filters.sakhiId = caller.id), so every row's sakhiId is the caller's
  // own id — falling through to the per-id fallback below would call
  // GET /sakhis/:sakhiId, which is SUPERVISOR/MANAGER/ADMIN-only and 403s a
  // SAKHI's own token, turning into a 502 for every SAKHI caller. Skip the
  // lookup entirely for this caller instead of trying to resolve a name
  // they already know is their own.
  const uncoveredSakhiIds = skipSakhiNameLookup
    ? []
    : [...new Set(items.map(sakhiIdOf).filter((id) => !supervisorRoster?.has(id)))];

  const [projectNames, villageNames, fallbackSakhiNames] = await Promise.all([
    resolveProjectNames(authorizationHeader),
    resolveVillageNames(authorizationHeader),
    Promise.all(uncoveredSakhiIds.map((id) => getSakhiName(id, authorizationHeader))),
  ]);
  const sakhiNameById = new Map<string, string | null>([
    ...(supervisorRoster ?? []),
    ...uncoveredSakhiIds.map((id, i) => [id, fallbackSakhiNames[i]] as const),
  ]);

  return items.map((item) => {
    const villageId = villageIdOf(item);
    return {
      ...item,
      sakhiName: sakhiNameById.get(sakhiIdOf(item)) ?? null,
      projectName: projectNames.get(projectIdOf(item)) ?? null,
      villageName: villageId ? (villageNames.get(villageId) ?? null) : null,
    };
  });
}

/** Public list-query params — see ListBeneficiariesQuery in the DTO for validation. */
export interface ListBeneficiariesQuery {
  projectId?: string;
  villageId?: string;
  padaId?: string;
  sakhiId?: string;
  status?: BeneficiaryStatus;
  caseType?: CaseType;
  atRiskOnly?: boolean;
  /** Raw search text — hashed the same way as duplicate-detection tokens (exact match only). */
  name?: string;
  mobileNumber?: string;
  fromDate?: string;
  toDate?: string;
  cursor?: string;
  limit: number;
}

/**
 * MANAGER and ADMIN are unrestricted across all Sakhi-scoping checks —
 * checked as the absence of an elevated role, not the presence of a
 * restrictive one (SAKHI/SUPERVISOR), since a caller can hold multiple role
 * assignments at once and must not be scoped down just because one of their
 * roles is restrictive. Matches the same isPrivileged() pattern in every
 * other service's own scoping helper.
 */
function isPrivileged(caller: AuthenticatedUser): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

/**
 * Resolves the sakhiId/sakhiIds scoping filters shared by `list()` and the
 * count-only summary endpoints: a SAKHI only ever sees their own cases, a
 * SUPERVISOR is scoped to their own roster (optionally narrowed to one
 * in-roster sakhiId), and MANAGER/ADMIN are unscoped unless they pass an
 * explicit sakhiId. Throws forbidden() for an out-of-roster sakhiId or a
 * SUPERVISOR with no project claim — same guards `list()` already enforced
 * inline before this was extracted for reuse by the summary endpoints.
 */
async function resolveSakhiScoping(
  querySakhiId: string | undefined,
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Promise<{ sakhiId?: string; sakhiIds?: string[] }> {
  if (isPrivileged(caller)) {
    return querySakhiId ? { sakhiId: querySakhiId } : {};
  }
  if (caller.roles.includes('SAKHI')) {
    return { sakhiId: caller.id };
  }
  if (caller.roles.includes('SUPERVISOR')) {
    if (!caller.projectId) {
      throw forbidden('Supervisor caller has no project scope.');
    }
    const roster = await listSakhiIdsForSupervisor(
      caller.projectId,
      caller.id,
      authorizationHeader,
    );
    if (querySakhiId) {
      if (!roster.includes(querySakhiId)) {
        throw forbidden("sakhiId is not in this Supervisor's roster.");
      }
      return { sakhiId: querySakhiId };
    }
    return { sakhiIds: roster };
  }
  return querySakhiId ? { sakhiId: querySakhiId } : {};
}

/** Business logic for the beneficiary enrollment lifecycle. */
export class BeneficiaryService {
  constructor(private readonly repository: BeneficiaryRepository) {}

  /**
   * Lists beneficiary cases per SRS FR-S-9.2 / HLD's filter set, scoped by
   * the caller's role: a SAKHI only ever sees their own cases (their own id
   * always wins over anything else, so a SAKHI-supplied `sakhiId` is
   * ignored), a SUPERVISOR only sees cases belonging to their own Sakhis
   * (resolved via auth-service's existing `/projects/:projectId/sakhis`,
   * filtered by supervisorId — no new auth-service endpoint) — if they
   * narrow the list to one `sakhiId`, it must be a member of their own
   * roster or the call is rejected rather than silently returning nothing —
   * and MANAGER/ADMIN see everything unscoped, including any `sakhiId` they
   * choose to filter by. Each row's name is decrypted server-side for
   * display — the search hash itself is never returned. Results are
   * cursor-paginated (HLD's cursor-pagination mandate) — see
   * BeneficiaryRepository.findMany for the cursor's shape.
   */
  async list(
    query: ListBeneficiariesQuery,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    // Cross-field check on fromDate/toDate — kept out of the Zod query
    // schema's own .refine() so that schema stays an AnyZodObject
    // (createDocumentedRouter() auto-infers it as this route's OpenAPI query
    // parameters; a .refine()'d ZodEffects can't be introspected there and
    // crashes the whole service at startup, not just this one request).
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
      throw badRequest('fromDate must be on or before toDate.');
    }

    const filters: BeneficiaryListFilters = {
      projectId: query.projectId,
      villageId: query.villageId,
      padaId: query.padaId,
      currentStatus: query.status,
      caseType: query.caseType,
      atRiskOnly: query.atRiskOnly,
      nameHash: query.name ? hashForSearch(normalizeForSearch(query.name)) : undefined,
      phoneHash: query.mobileNumber
        ? hashForSearch(normalizeForSearch(query.mobileNumber))
        : undefined,
      fromDate: query.fromDate,
      toDate: query.toDate,
      cursor: query.cursor,
      limit: query.limit,
    };

    let supervisorProjectId: string | undefined;
    let supervisorId: string | undefined;

    if (caller.roles.includes('SAKHI')) {
      filters.sakhiId = caller.id;
    } else if (caller.roles.includes('SUPERVISOR')) {
      // Per the SRS, a Supervisor has exactly one project — a caller missing
      // this claim is an invalid/inconsistent identity, not a "no project"
      // case to silently degrade into a malformed `/projects//sakhis` path.
      if (!caller.projectId) {
        throw forbidden('Supervisor caller has no project scope.');
      }
      const roster = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
      if (query.sakhiId) {
        if (!roster.includes(query.sakhiId)) {
          throw forbidden("sakhiId is not in this Supervisor's roster.");
        }
        filters.sakhiId = query.sakhiId;
      } else {
        filters.sakhiIds = roster;
      }
      supervisorProjectId = caller.projectId;
      supervisorId = caller.id;
    } else if (query.sakhiId) {
      // MANAGER/ADMIN: unscoped by default, but an explicit sakhiId still
      // narrows the list — no roster to validate against.
      filters.sakhiId = query.sakhiId;
    }

    const page = await this.repository.findMany(filters);
    const decrypted = page.items.map(withDecryptedName);
    // Reuses the roster call already made above for scoping, resolved a
    // second time for displayName instead of caching the first response —
    // simpler than threading an extra return value through every branch
    // above, and this call only happens for the SUPERVISOR path.
    const supervisorRoster =
      supervisorProjectId && supervisorId
        ? await listSakhiNamesForSupervisor(supervisorProjectId, supervisorId, authorizationHeader)
        : undefined;
    const enriched = await enrichListPage(
      decrypted,
      authorizationHeader,
      supervisorRoster,
      caller.roles.includes('SAKHI'),
    );
    return { items: enriched, nextCursor: page.nextCursor };
  }

  /**
   * Registration Summary widget — total/mother/child counts of in-scope
   * beneficiary cases, same role-scoping and optional fromDate/toDate range
   * as `list()`.
   */
  /**
   * Returns the bare in-scope beneficiary ids (no PII, no pagination) — used
   * by other services that own their own referral/visit/risk tables (no
   * cross-service joins per the forklift rule) but need to filter those
   * tables to one Sakhi/roster's beneficiaries. Same role-scoping as
   * list()/getRegistrationSummary; no date-range filter since callers need
   * the full in-scope set, not a registration-window slice.
   */
  async getIds(
    sakhiId: string | undefined,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const scoping = await resolveSakhiScoping(sakhiId, caller, authorizationHeader);
    return this.repository.findIds(scoping);
  }

  /**
   * MOTHER beneficiaries whose EDD has passed `cutoffDate` and who are still
   * in the ANC phase (no delivery outcome submitted yet) — for
   * visit-form-service's post-EDD visit-generation job. SYSTEM-only (see
   * beneficiary.routes.ts): unlike getIds/getPadaBreakdown, there is no
   * sakhiId/roster scoping here — the only caller is a background job
   * acting system-wide, not a human viewing their own scope.
   */
  async getPostEddPendingBeneficiaries(
    cutoffDate: string,
    limit: number,
    cursor: string | undefined,
  ) {
    return this.repository.findMotherIdsWithEddOnOrBefore(
      new Date(`${cutoffDate}T00:00:00.000Z`),
      limit,
      cursor,
    );
  }

  /**
   * Pada Breakdown widget — one row per distinct pada the caller's in-scope
   * beneficiaries live in (a beneficiary with no padaId on record is
   * excluded, per findIdsGroupedByPada), each with a resolved padaName,
   * villageName (via the pada's parentId), and the beneficiaryIds in that
   * pada — for other services to filter their own visit/referral tables by,
   * since padaId is owned only here (no cross-service joins per the
   * forklift rule). Same role-scoping as getIds.
   */
  async getPadaBreakdown(
    sakhiId: string | undefined,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const scoping = await resolveSakhiScoping(sakhiId, caller, authorizationHeader);
    const byPada = await this.repository.findIdsGroupedByPada(scoping);
    if (byPada.size === 0) return [];

    const [padaUnits, villageNames] = await Promise.all([
      resolvePadaUnits(authorizationHeader),
      resolveVillageNames(authorizationHeader),
    ]);

    return [...byPada.entries()].map(([padaId, beneficiaries]) => {
      const pada = padaUnits.get(padaId);
      return {
        padaId,
        padaName: pada?.name ?? null,
        villageName: (pada?.parentId ? villageNames.get(pada.parentId) : undefined) ?? null,
        beneficiaries,
      };
    });
  }

  /**
   * Decrypted name/phone plus a 4-bucket riskLevel, for the pada visit-list
   * screen's cards — no role-scoping here: the caller (api-gateway) has
   * already resolved the in-scope ids via its own pada/roster checks
   * before calling this. `search` narrows to an exact name-hash match
   * (names are encrypted, no partial/fuzzy search — same constraint as
   * GET /beneficiaries). RISK_GRADE's 6 values collapse to 4 buckets:
   * NORMAL -> none, MILD -> mild, MODERATE -> moderate, SEVERE/HIGH/
   * CRITICAL -> high (the 3 most severe grades all read as "urgent" on a
   * single badge). A beneficiary with no risk-condition-summary rows (or
   * only ungraded/self-reported ones, latestGradeRank null) is "none".
   */
  async getByIdsWithRisk(
    ids: string[],
    search: string | undefined,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    // Security: `ids` is caller-supplied and must never be trusted as-is —
    // without this, any authenticated caller could pass an arbitrary id
    // list and get back another Sakhi's beneficiaries' decrypted name/
    // phone/riskLevel (IDOR). Same self/roster/unscoped scoping as
    // getIds/getPadaBreakdown; findByIdsWithRisk intersects `ids` with this
    // scope in its own WHERE clause, so an out-of-scope id is silently
    // dropped from the result rather than surfaced as a 403.
    const scoping = await resolveSakhiScoping(undefined, caller, authorizationHeader);
    const nameHash = search ? hashForSearch(normalizeForSearch(search)) : undefined;
    const rows = await this.repository.findByIdsWithRisk(ids, nameHash, scoping);

    return rows.map((row) => ({
      id: row.id,
      beneficiaryName: decryptPii(row.fullNameEnc),
      phoneNumber: row.phoneEnc ? decryptPii(row.phoneEnc) : null,
      villageId: row.villageId,
      padaId: row.padaId,
      riskLevel: gradeToRiskLevel(row.latestGrade),
    }));
  }

  /**
   * Batch risk-condition-summary read — same ownership-scoping/silent-drop
   * pattern as getByIdsWithRisk above (never trust caller-supplied
   * beneficiaryIds as pre-scoped; an out-of-scope or nonexistent id is
   * simply absent from the result). Condition names are resolved in ONE
   * batched call to risk-referral-service across every distinct
   * riskConditionId in the whole result set, not per-beneficiary — avoids an
   * N+1 cross-service call pattern for a multi-beneficiary batch.
   */
  async getRiskConditionSummaryBatch(
    beneficiaryIds: string[],
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const scoping = await resolveSakhiScoping(undefined, caller, authorizationHeader);
    const rows = await this.repository.findRiskConditionSummariesByBeneficiaryIds(
      beneficiaryIds,
      scoping,
    );

    const allConditionIds = [
      ...new Set(rows.flatMap((r) => r.riskConditionSummaries.map((s) => s.riskConditionId))),
    ];
    let resolvedConditions: Map<
      string,
      { conditionCode: string; conditionName: string; gradeScale: string }
    >;
    try {
      resolvedConditions =
        allConditionIds.length > 0
          ? await resolveRiskConditions(allConditionIds, authorizationHeader)
          : new Map();
    } catch (err) {
      console.error(
        `Failed to resolve risk condition names for ids [${allConditionIds.join(', ')}] — ` +
          'returning riskConditionSummaries with null conditionCode/conditionName/gradeScale.',
        err,
      );
      resolvedConditions = new Map();
    }

    return rows.map((row) => ({
      beneficiaryId: row.beneficiaryId,
      riskConditionSummaries: row.riskConditionSummaries.map((s) => {
        const match = resolvedConditions.get(s.riskConditionId);
        return {
          riskConditionId: s.riskConditionId,
          phase: s.phase,
          latestGrade: s.latestGrade,
          latestAssessedAt: s.latestAssessedAt,
          everHighestGrade: s.everHighestGrade,
          everAtRiskFlag: s.everAtRiskFlag,
          currentReferralTriggerFlag: s.currentReferralTriggerFlag,
          currentHrVisitTriggerFlag: s.currentHrVisitTriggerFlag,
          isFirstInstance: s.isFirstInstance,
          consecutiveNoImprovementCount: s.consecutiveNoImprovementCount,
          conditionCode: match?.conditionCode ?? null,
          conditionName: match?.conditionName ?? null,
          gradeScale: match?.gradeScale ?? null,
        };
      }),
    }));
  }

  async getRegistrationSummary(
    query: SummaryQueryInput,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
      throw badRequest('fromDate must be on or before toDate.');
    }
    const scoping = await resolveSakhiScoping(query.sakhiId, caller, authorizationHeader);
    return this.repository.countByCaseType({
      ...scoping,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  }

  /**
   * Risk Summary widget — counts of in-scope beneficiaries' risk condition
   * summaries grouped by latestGrade, same role-scoping/date-range as
   * `list()`/getRegistrationSummary. Counts per-condition, not collapsed to
   * one grade per beneficiary (see BeneficiaryRepository.countByRiskGrade).
   */
  async getRiskSummary(
    query: SummaryQueryInput,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
      throw badRequest('fromDate must be on or before toDate.');
    }
    const scoping = await resolveSakhiScoping(query.sakhiId, caller, authorizationHeader);
    return this.repository.countByRiskGrade({
      ...scoping,
      fromDate: query.fromDate,
      toDate: query.toDate,
    });
  }

  /**
   * Upserts a beneficiary's per-condition risk rollup — called
   * server-to-server by risk-referral-service after it evaluates a
   * submission and writes its own RiskAssessment/RiskFlag source-of-truth
   * rows (see BeneficiaryRepository.upsertRiskConditionSummary for the
   * baseline/latest/everHighest semantics).
   *
   * Gated by requireRoles('SAKHI') at the route (this codebase has no
   * machine/service-account identity — the call chain forwards the
   * originating SAKHI's own token through visit-form-service and
   * risk-referral-service). assertCallerCanTouchCase alone doesn't cover
   * this route: it only scopes SUPERVISOR callers, early-returning for
   * everyone else — so a SAKHI reaching this method must be checked
   * explicitly, or any authenticated Sakhi could upsert any beneficiary's
   * risk rollup regardless of whose case it is.
   */
  async upsertRiskConditionSummary(
    beneficiaryId: string,
    dto: UpsertRiskConditionSummaryInput,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const found = await this.repository.findById(beneficiaryId);
    if (!found) throw notFound('Beneficiary case not found.');

    if (caller.roles.includes('SAKHI')) {
      if (found.sakhiId !== caller.id) {
        throw forbidden('This beneficiary case is outside your own roster.');
      }
    } else {
      await assertCallerCanTouchCase(found.sakhiId, caller, authorizationHeader);
    }

    return this.repository.upsertRiskConditionSummary(beneficiaryId, {
      riskConditionId: dto.riskConditionId,
      phase: dto.phase,
      grade: dto.grade ?? null,
      gradeRank: dto.gradeRank ?? null,
      // Untyped external JSON crossing into Prisma's InputJsonValue at this
      // one boundary — the zod schema (z.record) already guarantees a plain
      // JSON-serializable object.
      observedValueJson: (dto.observedValueJson as Prisma.InputJsonValue | undefined) ?? null,
      visitId: dto.visitId ?? null,
      submissionId: dto.submissionId ?? null,
      assessedAt: dto.assessedAt,
      isReferralTrigger: dto.isReferralTrigger,
      isHrVisitTrigger: dto.isHrVisitTrigger,
      ruleVersionId: dto.ruleVersionId ?? null,
      isFirstInstance: dto.isFirstInstance,
      consecutiveNoImprovementCount: dto.consecutiveNoImprovementCount,
    });
  }

  /**
   * Gated by requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER') at the route —
   * same as upsertRiskConditionSummary, assertCallerCanTouchCase alone
   * doesn't cover this route since it only scopes SUPERVISOR callers,
   * early-returning for everyone else. A SAKHI reaching this method must be
   * checked explicitly against the case's own sakhiId, or any authenticated
   * Sakhi could fetch any beneficiary's full profile by id regardless of
   * whose case it is (ADMIN is not in this route's role list, so MANAGER is
   * the only unrestricted caller here).
   */
  async getById(id: string, caller: AuthenticatedUser, authorizationHeader: string) {
    const found = await this.repository.findById(id);
    if (!found) throw notFound('Beneficiary case not found.');

    if (caller.roles.includes('SAKHI')) {
      if (found.sakhiId !== caller.id) {
        throw forbidden('This beneficiary case is outside your own roster.');
      }
    } else {
      await assertCallerCanTouchCase(found.sakhiId, caller, authorizationHeader);
    }

    const projected = await this.projectCase(id, authorizationHeader, found);
    // Only fetched for the single-case detail view — projectCase is also
    // reused by write-path re-fetches (applyLmpChange/reactivateCase/etc.),
    // which don't need an extra cross-service round trip to visit-form-
    // service just to return a response the caller already knows the
    // outcome of. Degrades to null on any failure (see
    // resolveLatestVisitVitals) rather than failing the whole request.
    const lastVisitVitals = await resolveLatestVisitVitals(id, authorizationHeader);
    return Object.assign(projected, { lastVisitVitals });
  }

  /**
   * Bare `{id, sakhiId, caseType}` ownership check, same role/roster rules
   * as getById but with none of its enrichment (pii/risk/socio/vitals) —
   * for a caller that only needs to verify "may this caller see this
   * beneficiary," not fetch the full profile. Exists specifically so
   * visit-form-service's latest-visit-vitals resolver can verify ownership
   * without calling back into getById itself, which would recreate the
   * exact request cycle this method exists to avoid (getById ->
   * resolveLatestVisitVitals -> visit-form-service ->
   * this-service-again-via-getById -> resolveLatestVisitVitals -> ...).
   */
  async getOwnership(id: string, caller: AuthenticatedUser, authorizationHeader: string) {
    const found = await this.repository.findOwnershipById(id);
    if (!found) throw notFound('Beneficiary case not found.');

    if (caller.roles.includes('SAKHI')) {
      if (found.sakhiId !== caller.id) {
        throw forbidden('This beneficiary case is outside your own roster.');
      }
    } else {
      await assertCallerCanTouchCase(found.sakhiId, caller, authorizationHeader);
    }

    return found;
  }

  /**
   * Decrypts/enriches a case row for the response envelope, without any
   * ownership check — only for use by callers that have already verified
   * (or, per their own route's role gate, can't reach a case outside their
   * own scope) that the requester may see this record: getById (after its
   * own check above) and the post-mutation re-fetches in applyLmpChange/
   * reactivateCase (each of which already ran assertCallerCanTouchCase
   * before reaching this point). upsertSocioDemographics also calls this,
   * but takes no caller and runs no ownership check of its own — a known,
   * separately-tracked gap (see PATCH /beneficiaries/:id/socio-demographics
   * in the PR description), not something this helper covers for it. Never
   * call this directly from a route handler.
   */
  private async projectCase(
    id: string,
    authorizationHeader: string,
    prefetched?: Awaited<ReturnType<BeneficiaryRepository['findById']>>,
  ) {
    const found = prefetched ?? (await this.repository.findById(id));
    if (!found) throw notFound('Beneficiary case not found.');
    const projected = withDecryptedName(found);
    const withSocio = await withResolvedSocioDemographics(projected, authorizationHeader);
    const withRiskLevel = withOverallRiskLevel(withSocio);
    return withResolvedRiskConditionNames(withRiskLevel, authorizationHeader);
  }

  /**
   * Upserts the socio-demographic answers for an existing beneficiary, taking
   * the registration form's own `value_code` strings and resolving them to
   * lookup_values ids here (see resolveLookupIdsByValueCode) — the caller is
   * visit-form-service forwarding a MOTHER_REGISTRATION submission, and a form
   * answer is a value_code, not an id.
   *
   * An unrecognised value_code resolves to null rather than failing: one
   * unmatched dropdown answer must not reject a whole registration's worth of
   * socio-demographic data.
   */
  async upsertSocioDemographics(
    beneficiaryId: string,
    dto: UpsertSocioDemographicsInput,
    authorizationHeader: string,
  ) {
    const found = await this.repository.findById(beneficiaryId);
    if (!found) throw notFound('Beneficiary case not found.');

    // field name on this DTO -> the *LookupId column it populates.
    const lookupFields: Record<string, { column: string; categoryCode: string }> = {
      phoneOwner: { column: 'phoneOwnerLookupId', categoryCode: 'PHONE_OWNER' },
      mobileNetworkAvailability: {
        column: 'mobileNetworkAvailabilityLookupId',
        categoryCode: 'MOBILE_NETWORK_AVAILABILITY',
      },
      educationLevel: { column: 'educationLevelLookupId', categoryCode: 'EDUCATION_LEVEL' },
      partnerEducationLevel: {
        column: 'partnerEducationLevelLookupId',
        categoryCode: 'EDUCATION_LEVEL',
      },
      partnerOccupation: {
        column: 'partnerOccupationLookupId',
        categoryCode: 'PARTNER_OCCUPATION',
      },
      migrationPattern: { column: 'migrationPatternLookupId', categoryCode: 'MIGRATION_PATTERN' },
      monthlyIncome: { column: 'monthlyIncomeLookupId', categoryCode: 'MONTHLY_INCOME_BRACKET' },
      religion: { column: 'religionLookupId', categoryCode: 'RELIGION' },
      socialCategory: { column: 'socialCategoryLookupId', categoryCode: 'SOCIAL_CATEGORY' },
    };

    const requests: Record<string, { categoryCode: string; valueCode: string | null }> = {};
    for (const [dtoField, { categoryCode }] of Object.entries(lookupFields)) {
      const supplied = dto[dtoField as keyof UpsertSocioDemographicsInput];
      if (typeof supplied === 'string') {
        requests[dtoField] = { categoryCode, valueCode: supplied };
      }
    }

    const resolvedIds = Object.keys(requests).length
      ? await resolveLookupIdsByValueCode(requests, authorizationHeader)
      : {};

    // Only write what the caller actually supplied — see the repository's
    // upsert doc comment on why an absent key must not null the column.
    const data: Record<string, unknown> = {};
    for (const [dtoField, { column }] of Object.entries(lookupFields)) {
      if (dtoField in requests) data[column] = resolvedIds[dtoField] ?? null;
    }
    if (dto.yearsInVillage !== undefined) data.yearsInVillage = dto.yearsInVillage;
    if (dto.familyMembersCount !== undefined) data.familyMembersCount = dto.familyMembersCount;
    if (dto.childrenUnder5Count !== undefined) data.childrenUnder5Count = dto.childrenUnder5Count;

    await this.repository.upsertSocioDemographics(beneficiaryId, data);
    return this.projectCase(beneficiaryId, authorizationHeader);
  }

  /**
   * Applies an approved LMP change (FR-SV-4.2) — recomputes eddDate from the
   * same GESTATION_DAYS formula used at registration so lmpDate/eddDate can
   * never drift out of sync. Called server-to-server by approval-service
   * once a Supervisor approves an LMP_CHANGE Quick Response card.
   *
   * Deliberately does not regenerate the ANC visit schedule — schedules are
   * generated offline on the Sakhi's device (FR-S-2.2) and uploaded via
   * visit-form-service's POST /visit-schedules/bulk; this service owns no
   * schedule-generation logic to trigger. Re-syncing/regenerating the
   * schedule after an LMP change is the Sakhi app's responsibility, not
   * this endpoint's — a known, accepted gap, not an oversight.
   *
   * A SUPERVISOR caller may only apply this to a case in their own Sakhi
   * roster (same scoping as list()) — this endpoint is reachable by a human
   * Supervisor role, not just server-to-server, so it needs the same IDOR
   * guard as any other single-case mutation.
   */
  async applyLmpChange(
    beneficiaryId: string,
    lmpDate: Date,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(beneficiaryId);
    if (!existing) throw notFound('Beneficiary case not found.');
    await assertCallerCanTouchCase(existing.sakhiId, caller, authorizationHeader);

    const eddDate = addDays(lmpDate, GESTATION_DAYS);
    const updated = await this.repository.updateMotherLmp(beneficiaryId, lmpDate, eddDate);
    if (!updated) throw notFound('Beneficiary case not found.');
    return this.projectCase(beneficiaryId, authorizationHeader);
  }

  /**
   * Advances currentPhase after a DELIVERY_VISIT submission (CR-041):
   * ANC->PP for the mother, or ->NN for an auto-created child. Called
   * server-to-server by visit-form-service, forwarding the submitting
   * SAKHI's own token — this codebase has no machine/service-account
   * identity (same pattern as upsertRiskConditionSummary). Only these two
   * transitions are accepted; anything else 409s rather than silently
   * moving a case backward or into an unrelated phase.
   *
   * Idempotent for a same-value "transition" (e.g. a child case already at
   * NN from creation, or a retried delivery submission) — repository
   * updatePhase's guard is `currentPhase = fromPhase`, and fromPhase here is
   * derived from the target itself for the child leg / from the case's own
   * current value when it already matches, so a repeat call is a no-op
   * success rather than a spurious 409.
   *
   * A SAKHI caller may only apply this to their own case (same ownership
   * check as upsertRiskConditionSummary) — assertCallerCanTouchCase alone
   * doesn't cover this route, since it only scopes SUPERVISOR callers.
   *
   * Blocks a case in PENDING_TRANSFER — markPendingTransfer deliberately
   * leaves sakhiId unchanged during the Manager review window, so this
   * status needs its own explicit guard rather than relying on ownership
   * checks to catch it.
   */
  async applyPhaseChange(
    beneficiaryId: string,
    toPhase: CasePhase,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(beneficiaryId);
    if (!existing) throw notFound('Beneficiary case not found.');

    if (caller.roles.includes('SAKHI')) {
      if (existing.sakhiId !== caller.id) {
        throw forbidden('This beneficiary case is outside your own roster.');
      }
    } else {
      await assertCallerCanTouchCase(existing.sakhiId, caller, authorizationHeader);
    }

    if (existing.currentStatus === 'PENDING_TRANSFER') {
      throw conflict('Cannot change phase for a beneficiary case pending Manager transfer review.');
    }

    const fromPhase = existing.currentPhase as CasePhase;
    if (fromPhase === toPhase) {
      return this.projectCase(beneficiaryId, authorizationHeader, existing);
    }

    const isValidTransition =
      (existing.caseType === 'MOTHER' && fromPhase === 'ANC' && toPhase === 'PP') ||
      (existing.caseType === 'CHILD' &&
        // NN->NN is a no-op already short-circuited above; NN->INC and
        // INC->CCV are the two real forward transitions a CHILD case makes,
        // triggered by the first INC-type / CCV-type visit submission (see
        // visit-form-service's form.service.ts). CCV->CLOSED goes through
        // applyClosure, not this method.
        ((fromPhase === 'NN' && toPhase === 'NN') ||
          (fromPhase === 'NN' && toPhase === 'INC') ||
          (fromPhase === 'INC' && toPhase === 'CCV')));
    if (!isValidTransition) {
      throw conflict(`Cannot move a ${existing.caseType} case from ${fromPhase} to ${toPhase}.`);
    }

    const updated = await this.repository.updatePhase(
      beneficiaryId,
      existing.caseType as CaseType,
      fromPhase,
      toPhase,
    );
    if (!updated) {
      // Raced with another phase change between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict(`Cannot move a ${existing.caseType} case from ${fromPhase} to ${toPhase}.`);
    }

    return this.projectCase(beneficiaryId, authorizationHeader);
  }

  /**
   * Writes ChildCaseDetails.ccvOpeningRiskState once, at the INC->CCV
   * transition (BR-13). Called server-to-server by visit-form-service right
   * after its own PATCH .../phase call lands the case at CCV — same
   * no-machine-identity stance as applyPhaseChange, so gated by the same
   * requireRoles('SAKHI') and ownership check.
   *
   * Deliberately does NOT re-check `currentPhase === 'CCV'` — BR-13's
   * computation (last-3-INC-visits scan) is itself only triggered by
   * visit-form-service's own INC->CCV transition, and re-validating the
   * phase here would just be trusting the same caller's own prior call
   * twice. A MOTHER case (no ChildCaseDetails row) or a beneficiary with no
   * row yet 404s rather than silently no-op'ing, since this method is only
   * ever called right after a real CCV transition — an unexpected 404 here
   * signals a caller-side sequencing bug worth surfacing, not swallowing.
   */
  async setCcvOpeningRiskState(
    beneficiaryId: string,
    ccvOpeningRiskState: CcvOpeningRiskState,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(beneficiaryId);
    if (!existing) throw notFound('Beneficiary case not found.');

    if (caller.roles.includes('SAKHI')) {
      if (existing.sakhiId !== caller.id) {
        throw forbidden('This beneficiary case is outside your own roster.');
      }
    } else {
      await assertCallerCanTouchCase(existing.sakhiId, caller, authorizationHeader);
    }

    const updated = await this.repository.setCcvOpeningRiskState(
      beneficiaryId,
      ccvOpeningRiskState,
    );
    if (!updated) throw notFound('No ChildCaseDetails row exists for this beneficiary.');

    return this.projectCase(beneficiaryId, authorizationHeader);
  }

  /**
   * Closes a beneficiary case after a closure submission (ANC_CLOSURE_VISIT
   * / CHILD_CLOSURE_VISIT) — the "beneficiary moves to the Closed list"
   * consequence closure-reopen-service's own ClosureService is documented
   * as NOT owning (forklift rule). Called server-to-server by
   * closure-reopen-service, forwarding the submitting SAKHI's own token for
   * an immediate (non-reviewed) closure, or the deciding Supervisor's token
   * for an approved MIGRATION closure — this codebase has no
   * machine/service-account identity (same pattern as
   * upsertRiskConditionSummary/applyPhaseChange).
   *
   * Idempotent by design (mobile is offline-first and may retry this call
   * after a dropped connection): closing an already-CLOSED case is a
   * no-op success, not a 409 — repository.closeCase returning true for
   * "already CLOSED" and this method short-circuiting on that read both
   * exist for the same reason, so a retry never fails just because the
   * first attempt actually succeeded.
   *
   * A SAKHI caller may only apply this to their own case (same ownership
   * check as applyPhaseChange) — assertCallerCanTouchCase alone doesn't
   * cover this route, since it only scopes SUPERVISOR callers.
   *
   * KNOWN GAP: this is reachable directly by a SAKHI (not just via
   * closure-reopen-service's own call chain) — this codebase has no
   * machine/service-account identity, so "server-to-server only" can't be
   * cryptographically enforced today. A SAKHI who owns the case can call
   * this endpoint directly with any reasonCode and close it without ever
   * creating a `closures` row via POST /closures — bypassing that record's
   * audit trail and (for a MIGRATION-equivalent reason) the supervisor
   * review closure-reopen-service's ClosureService.create() would have
   * required. The ownership check above bounds this to a SAKHI's own case
   * (not a cross-tenant IDOR), but it is a real gap in the review workflow.
   * Tracked as a follow-up, not fixed here — would need a real machine
   * identity concept to close properly.
   *
   * Blocks a case in PENDING_TRANSFER — markPendingTransfer deliberately
   * leaves sakhiId unchanged during the Manager review window, so the
   * owning Sakhi (or her Supervisor) would otherwise still pass the
   * ownership check above and silently discard the pending review by
   * closing the case out from under it.
   */
  async applyClosure(
    beneficiaryId: string,
    reasonCode: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(beneficiaryId);
    if (!existing) throw notFound('Beneficiary case not found.');

    if (caller.roles.includes('SAKHI')) {
      if (existing.sakhiId !== caller.id) {
        throw forbidden('This beneficiary case is outside your own roster.');
      }
    } else {
      await assertCallerCanTouchCase(existing.sakhiId, caller, authorizationHeader);
    }

    if (existing.currentStatus === 'PENDING_TRANSFER') {
      throw conflict('Cannot close a beneficiary case pending Manager transfer review.');
    }

    if (existing.currentStatus === 'CLOSED') {
      // Idempotent no-op only for a genuine retry of the SAME closure
      // (matching reasonCode) — the doc comment above claims reasonCode is
      // "recorded on beneficiary_status_history for audit," which would be
      // false for a differing reasonCode silently swallowed here (e.g.
      // closed once as MEDICAL, then a real MIGRATION closure attempt
      // returning 200 with no trace of ever happening). A genuinely
      // different closure reason for an already-closed case is a caller
      // error, not a retry — surfaced as a 409 rather than silently dropped.
      const lastClose = existing.statusHistory.find((h) => h.toStatus === 'CLOSED');
      if (!lastClose || lastClose.reasonCode === reasonCode) {
        return this.projectCase(beneficiaryId, authorizationHeader, existing);
      }
      throw conflict(
        `This case was already closed with reason ${lastClose.reasonCode}, not ${reasonCode}.`,
      );
    }

    const closed = await this.repository.closeCase(beneficiaryId, caller.id, reasonCode);
    if (!closed) {
      // Either the case was deleted between the read above and this call,
      // or (per closeCase's own doc comment) it raced to CLOSED via another
      // path in that same window — re-read rather than assuming either.
      const recheck = await this.repository.findById(beneficiaryId);
      if (!recheck) throw notFound('Beneficiary case not found.');
      if (recheck.currentStatus === 'CLOSED') {
        const raceWinner = recheck.statusHistory.find((h) => h.toStatus === 'CLOSED');
        if (!raceWinner || raceWinner.reasonCode === reasonCode) {
          return this.projectCase(beneficiaryId, authorizationHeader, recheck);
        }
        throw conflict(
          `This case was already closed with reason ${raceWinner.reasonCode}, not ${reasonCode}.`,
        );
      }
      throw conflict('Unable to close this beneficiary case.');
    }

    return this.projectCase(beneficiaryId, authorizationHeader);
  }

  /**
   * Missed Visit Escalation TRANSFER (FR-SV-4.3's "beneficiary removed from
   * current Sakhi's list" outcome) — called server-to-server by
   * notification-escalation-service's decideMissedVisit, forwarding the
   * deciding Supervisor's own token. Route-gated to SUPERVISOR/MANAGER/ADMIN
   * (see beneficiary.routes.ts) — unlike /close, a SAKHI has no reason to
   * transfer her own beneficiary away for Manager review, so this is not
   * also reachable by the case's own Sakhi.
   */
  async applyTransfer(
    beneficiaryId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(beneficiaryId);
    if (!existing) throw notFound('Beneficiary case not found.');
    await assertCallerCanTouchCase(existing.sakhiId, caller, authorizationHeader);
    if (existing.currentStatus === 'CLOSED') {
      throw conflict('Cannot transfer a CLOSED beneficiary case.');
    }

    const updated = await this.repository.markPendingTransfer(beneficiaryId, caller.id);
    if (!updated) {
      // Raced with another status change between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read (mirrors reactivateCase).
      throw conflict('Cannot transfer a CLOSED beneficiary case.');
    }

    return this.projectCase(beneficiaryId, authorizationHeader);
  }

  /**
   * Reactivates a CLOSED beneficiary case after an approved reopen request
   * (FR-SV-4.7/FR-S-10.3) — the "Beneficiary is added to Sakhi's Open
   * beneficiary list" outcome. Called server-to-server by
   * closure-reopen-service once a Supervisor approves a ReopenRequest.
   *
   * A SUPERVISOR caller may only reactivate a case in their own Sakhi
   * roster (same scoping as list()) — this endpoint is reachable by a human
   * Supervisor role, not just server-to-server, so it needs the same IDOR
   * guard as any other single-case mutation.
   */
  async reactivateCase(
    beneficiaryId: string,
    reactivatedByUserId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(beneficiaryId);
    if (!existing) throw notFound('Beneficiary case not found.');
    await assertCallerCanTouchCase(existing.sakhiId, caller, authorizationHeader);
    if (existing.currentStatus !== 'CLOSED') {
      throw conflict(`Cannot reactivate a case with status ${existing.currentStatus}.`);
    }

    const reactivated = await this.repository.reactivateCase(beneficiaryId, reactivatedByUserId);
    if (!reactivated) {
      // Raced with another status change between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict(`Cannot reactivate a case with status ${existing.currentStatus}.`);
    }

    return this.projectCase(beneficiaryId, authorizationHeader);
  }

  /**
   * Enrolls a mother or child beneficiary per SRS FR-S-2.1/2.3/2.4/2.5.
   * `capturedByUserId` is the authenticated caller (Sakhi) recording consent.
   * `authorizationHeader` is the same caller's original bearer token,
   * forwarded unchanged to resolve pii.healthBlockId server-side from
   * pii.phcId (see geography.client.ts) — the mobile enrollment form has no
   * field to capture Health Block itself.
   */
  async create(dto: CreateBeneficiaryInput, capturedByUserId: string, authorizationHeader: string) {
    // Idempotent replay: a dropped-connection retry resubmits the same
    // localCaseUuid the device generated for this enrollment. Return the
    // original case rather than re-running consent/duplicate/create logic —
    // matches how form_submissions/visit_instances treat their own local
    // uuid as "already handled," not a fresh operation.
    const existing = await this.repository.findByLocalCaseUuid(dto.case.localCaseUuid);
    if (existing)
      return withResolvedSocioDemographics(withDecryptedName(existing), authorizationHeader);

    if (dto.consent.status === 'REFUSED') {
      // Per SRS: "No" halts registration entirely — nothing is persisted.
      throw unprocessable('Consent not received. Registration cannot proceed.');
    }

    // SRS §G.4: a stillbirth "no child journey is initiated" — block a new
    // CHILD case for a specific DELIVERY_VISIT child slot if that exact
    // slot's own recorded outcome was a stillbirth. Slot-based (via
    // childDetails.birthOrder), not count-based: the old
    // `existingChildCount >= liveBirthCount` comparison was order-dependent
    // — for a twin case (slot 1 stillbirth, slot 2 live birth), whichever
    // slot's CHILD case was submitted FIRST always passed, so a bogus/
    // out-of-order request for the stillborn slot could wrongly consume the
    // count and block the real live twin's later, legitimate registration.
    // Checking the caller's own claimed slot against that slot's actual
    // outcome has no such ordering dependency.
    //
    // birthOrder is required ONLY when this mother's DELIVERY_VISIT has a
    // stillbirth on record — i.e. only when there is actually something to
    // disambiguate. This is deliberately NOT "required whenever
    // motherBeneficiaryId is set": the standalone Child Registration screen
    // (registering a child born before this app was in use, or outside any
    // recorded delivery session) has no birthOrder field today and calls
    // this endpoint with motherBeneficiaryId set for a "registered mother"
    // path unrelated to any stillbirth — that flow must keep working
    // unchanged. A mother with all live births, or no DELIVERY_VISIT at
    // all, never requires birthOrder and this guard never blocks her.
    if (dto.case.caseType === 'CHILD' && dto.case.motherBeneficiaryId) {
      const outcomes = await resolveDeliveryOutcomesBySlot(
        dto.case.motherBeneficiaryId,
        authorizationHeader,
      );
      const hasStillbirth = outcomes.some((entry) => isStillbirthOutcome(entry.outcome));

      if (hasStillbirth) {
        const birthOrder = dto.childDetails?.birthOrder;
        if (!birthOrder) {
          throw unprocessable(
            'childDetails.birthOrder is required to register a child for a mother whose ' +
              'delivery record includes a stillbirth.',
          );
        }

        const slot = outcomes.find((entry) => entry.birthOrder === birthOrder);
        if (slot && isStillbirthOutcome(slot.outcome)) {
          throw unprocessable(
            'This delivery slot was recorded as a stillbirth — a child record cannot be ' +
              'created for it.',
            { reason: 'CHILD_ALREADY_STILLBIRTH', birthOrder, outcome: slot.outcome },
          );
        }
      }
    }

    const fullName = dto.pii.fullName;
    const searchTokens = buildSearchTokens(dto, fullName);

    if (!dto.acknowledgeDuplicate) {
      const match = await this.repository.findDuplicateCandidate(searchTokens);
      if (match) {
        evaluateDuplicateMatch(match, dto);
      }
    }

    const motherDetails = dto.motherDetails
      ? {
          lmpDate: dto.motherDetails.lmpDate,
          eddDate: addDays(dto.motherDetails.lmpDate, GESTATION_DAYS),
          gravida: dto.motherDetails.gravida ?? null,
          parity: dto.motherDetails.parity ?? null,
          heightCm: dto.motherDetails.heightCm ?? null,
          bmiAtRegistration: computeBmi(dto.motherDetails.heightCm, dto.motherDetails.weightKg),
        }
      : null;

    const childDetails = dto.childDetails
      ? {
          motherBeneficiaryId: dto.case.motherBeneficiaryId ?? null,
          dateOfBirth: dto.childDetails.dateOfBirth,
          sex: dto.childDetails.sex ?? null,
          birthWeightKg: dto.childDetails.birthWeightKg ?? null,
          birthLengthCm: dto.childDetails.birthLengthCm ?? null,
          prematureFlag: dto.childDetails.prematureFlag ?? null,
          birthOrder: dto.childDetails.birthOrder ?? null,
          linkedAncCase: Boolean(dto.case.motherBeneficiaryId),
        }
      : null;

    const socioDemographics = dto.socioDemographics
      ? {
          phoneOwnerLookupId: dto.socioDemographics.phoneOwnerLookupId ?? null,
          mobileNetworkAvailabilityLookupId:
            dto.socioDemographics.mobileNetworkAvailabilityLookupId ?? null,
          educationLevelLookupId: dto.socioDemographics.educationLevelLookupId ?? null,
          partnerEducationLevelLookupId:
            dto.socioDemographics.partnerEducationLevelLookupId ?? null,
          partnerOccupationLookupId: dto.socioDemographics.partnerOccupationLookupId ?? null,
          yearsInVillage: dto.socioDemographics.yearsInVillage ?? null,
          migrationPatternLookupId: dto.socioDemographics.migrationPatternLookupId ?? null,
          monthlyIncomeLookupId: dto.socioDemographics.monthlyIncomeLookupId ?? null,
          religionLookupId: dto.socioDemographics.religionLookupId ?? null,
          socialCategoryLookupId: dto.socioDemographics.socialCategoryLookupId ?? null,
          familyMembersCount: dto.socioDemographics.familyMembersCount ?? null,
          childrenUnder5Count: dto.socioDemographics.childrenUnder5Count ?? null,
        }
      : null;

    const journeyStartDate = dto.case.registrationDate;
    const currentPhase = dto.case.caseType === 'MOTHER' ? 'ANC' : 'NN';

    // Mobile never sends pii.healthBlockId (no field for it on the enrollment
    // form) — derive it server-side from pii.phcId's parent Health Block
    // instead of persisting null for every case.
    const healthBlockId = await resolveHealthBlockIdFromPhc(dto.pii.phcId, authorizationHeader);

    const created = await this.repository.createEnrollment({
      pii: {
        fullNameEnc: encryptPii(fullName),
        fullNameSearchHash: hashForSearch(normalizeForSearch(fullName)),
        phoneEnc: dto.pii.phone ? encryptPii(dto.pii.phone) : null,
        phoneSearchHash: dto.pii.phone ? hashForSearch(normalizeForSearch(dto.pii.phone)) : null,
        alternatePhoneEnc: dto.pii.alternatePhone ? encryptPii(dto.pii.alternatePhone) : null,
        villageId: dto.pii.villageId ?? null,
        padaId: dto.pii.padaId ?? null,
        healthSubCentreId: dto.pii.healthSubCentreId ?? null,
        phcId: dto.pii.phcId ?? null,
        healthBlockId,
        dateOfBirth: dto.pii.dateOfBirth ?? null,
        sex: dto.pii.sex ?? null,
        addressLineEnc: dto.pii.addressLine ? encryptPii(dto.pii.addressLine) : null,
        stateId: dto.pii.stateId ?? null,
        districtId: dto.pii.districtId ?? null,
        talukaId: dto.pii.talukaId ?? null,
        rchNumberEnc: dto.pii.rchNumber ? encryptPii(dto.pii.rchNumber) : null,
        rchNumberHash: dto.pii.rchNumber
          ? hashForSearch(normalizeForSearch(dto.pii.rchNumber))
          : null,
      },
      case: {
        localCaseUuid: dto.case.localCaseUuid,
        projectId: dto.case.projectId,
        // Always the authenticated caller's own id — dto.case.sakhiId is
        // ignored even if present, so a Sakhi can never enroll a beneficiary
        // under another Sakhi's name (see caseSchema.sakhiId).
        sakhiId: capturedByUserId,
        caseType: dto.case.caseType,
        registrationDate: dto.case.registrationDate,
        previousBeneficiaryId: dto.case.previousBeneficiaryId ?? null,
        motherBeneficiaryId: dto.case.motherBeneficiaryId ?? null,
        beneficiaryTypeLookupId: dto.case.beneficiaryTypeLookupId,
        caseTypeLookupId: dto.case.caseTypeLookupId,
        journeyStartDate,
        currentPhase,
      },
      motherDetails,
      childDetails,
      socioDemographics,
      searchTokens,
      consentDate: dto.consent.date,
      consentCapturedByUserId: capturedByUserId,
    });

    const projected = {
      ...withDecryptedName(created),
      // Nothing has accrued yet for a case created in this same call — risk
      // evaluation and status transitions only happen after visits/status
      // changes (see the repository's comment on the create query).
      riskConditionSummaries: [] as BeneficiaryRiskConditionSummary[],
      statusHistory: [] as BeneficiaryStatusHistory[],
    };
    return withResolvedSocioDemographics(projected, authorizationHeader);
  }

  /**
   * Server-to-server only — see restore-for-sakhi.dto.ts and the
   * repository method's own doc comment for the full rationale. No
   * caller-scoping check here (unlike reactivateCase's
   * assertCallerCanTouchCase): SYSTEM/ADMIN-only route access is the
   * authorization boundary, since this restores everything a Sakhi owned
   * rather than one caller-chosen case.
   */
  async restoreForSakhi(sakhiUserId: string) {
    return this.repository.restoreForSakhi(sakhiUserId);
  }
}
