import { addDays } from '@armman/core';
import {
  badRequest,
  conflict,
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
import type { BeneficiaryStatus, CaseType } from './beneficiary.constants';
import { buildSearchTokens, evaluateDuplicateMatch } from './beneficiary.duplicate-detection';
import { computeBmi, withDecryptedName } from './beneficiary.mapper';
import type { BeneficiaryListFilters, BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';
import type { UpsertRiskConditionSummaryInput } from './dto/upsert-risk-condition-summary.dto';
import type { SummaryQueryInput } from './dto/summary-query.dto';
import type { UpsertSocioDemographicsInput } from './dto/upsert-socio-demographics.dto';
import { resolveHealthBlockIdFromPhc, resolveVillageNames } from '../geography/geography.client';
import { resolveLookupIdsByValueCode, resolveLookupValues } from '../lookups/lookup.client';
import {
  getSakhiName,
  listSakhiIdsForSupervisor,
  listSakhiNamesForSupervisor,
} from '../sakhi/sakhi.client';
import { resolveProjectNames } from '../projects/project.client';

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

const GESTATION_DAYS = 280;

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
    });
  }

  async getById(id: string, authorizationHeader: string) {
    const found = await this.repository.findById(id);
    if (!found) throw notFound('Beneficiary case not found.');
    const projected = withDecryptedName(found);
    return withResolvedSocioDemographics(projected, authorizationHeader);
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
    return this.getById(beneficiaryId, authorizationHeader);
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
    return this.getById(beneficiaryId, authorizationHeader);
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

    return this.getById(beneficiaryId, authorizationHeader);
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
}
