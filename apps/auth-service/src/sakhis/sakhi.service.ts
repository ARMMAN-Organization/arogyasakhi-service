import { badRequest, forbidden, notFound } from '@armman/service-commons';
import { startOfUTCDay } from '@armman/core';
import type { SakhiRepository } from './sakhi.repository';
import type { GeographyRepository } from '../geography/geography.repository';
import type { CreateLocationAssignmentInput } from './dto/create-location-assignment.dto';
import type { UpdateLocationAssignmentInput } from './dto/update-location-assignment.dto';

/** The calling principal's own scope, as carried on their JWT/trusted-identity headers. */
export interface CallerScope {
  readonly id: string;
  readonly roles: string[];
  readonly projectId: string | null;
}

/**
 * Response is projected to a safe subset — never the encrypted PII tokens
 * (panToken/aadhaarToken/bankAccountToken), passwordHash, or other audit
 * columns. Combines User (identity) and SakhiProfile (program assignment)
 * fields, since a Sakhi is 1:1 across the two tables.
 *
 * `sakhiId` is the Sakhi's `users.user_id` (not the `sakhi_profiles` row's
 * own PK) — this is the id every other service treats as "the Sakhi's
 * identity" (it's the JWT `sub`, and what `beneficiary_cases.sakhi_id` and
 * beneficiary-service's own-case filter both key on). Returning the profile
 * PK here instead would silently break Supervisor-scoped queries downstream,
 * since it's a different id for the same person.
 */
function toApiSakhi(profile: Record<string, unknown>) {
  const user = profile.user as Record<string, unknown>;
  return {
    sakhiId: user.id,
    displayName: user.displayName,
    mobileNumber: user.mobileNumber,
    status: user.status,
    employeeCode: profile.employeeCode,
    primaryProjectId: profile.primaryProjectId,
    supervisorId: profile.supervisorId,
    activeFrom: profile.activeFrom,
    activeTo: profile.activeTo,
  };
}

/**
 * MANAGER and ADMIN are unrestricted across all Sakhi-scoping checks —
 * checked as the absence of an elevated role, not the presence of a
 * restrictive one (SUPERVISOR), since a caller can hold multiple role
 * assignments at once (see auth.service.ts's issueTokens) and must not be
 * scoped down just because one of their roles is restrictive. Matches
 * the same isPrivileged() pattern in
 * supervisor-operations-service/operations.service.ts.
 */
function isPrivileged(caller: CallerScope): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

/**
 * Projects a `SakhiLocationAssignment` row to its API shape — same
 * villageId/padaId/effectiveFrom/effectiveTo subset `getActiveLocationAssignments`
 * already returns, plus `id` for the write endpoints (edit/end) to address it by.
 */
function toApiLocationAssignment(row: {
  id: string;
  villageId: string;
  padaId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}) {
  return {
    id: row.id,
    villageId: row.villageId,
    padaId: row.padaId,
    effectiveFrom: row.effectiveFrom,
    effectiveTo: row.effectiveTo,
  };
}

/** Business logic for Sakhi profile reads. */
export class SakhiService {
  constructor(
    private readonly repository: SakhiRepository,
    private readonly geographyRepository: GeographyRepository,
  ) {}

  /**
   * A caller with a project scope on their JWT (typically SUPERVISOR — one
   * project per Supervisor per SRS) may only see that project's Sakhis. A
   * privileged caller (MANAGER/ADMIN, who oversee multiple projects — HLD's
   * dashboard "Project Selector") is unrestricted here.
   *
   * A non-privileged (SUPERVISOR) caller is further scoped to only their
   * own assigned Sakhis (supervisorId === caller.id) — otherwise every
   * Supervisor sharing a project sees every other Supervisor's Sakhis too,
   * since project membership alone doesn't imply ownership. MANAGER/ADMIN
   * see every Sakhi in the project, matching the project-level check above.
   */
  async listByProject(projectId: string, caller: CallerScope) {
    if (caller.projectId && caller.projectId !== projectId) {
      throw forbidden('You do not have access to this project.');
    }
    const profiles = await this.repository.findByProject(projectId);
    const mapped = profiles.map((p) => toApiSakhi(p as unknown as Record<string, unknown>));
    if (isPrivileged(caller)) {
      return mapped;
    }
    return mapped.filter((s) => s.supervisorId === caller.id);
  }

  /**
   * A SAKHI caller may only fetch their own record — this route otherwise
   * backs the Supervisor's Sakhi picker/detail header (see this class's doc
   * comment), not a Sakhi looking up another Sakhi. Added for the Sakhi
   * dashboard (api-gateway's GET /sakhi/:sakhiId/dashboard), which needs a
   * Sakhi's own displayName and the JWT carries no such field. Returns
   * immediately once the self-check passes — the SUPERVISOR project-scope
   * check below must NOT also run for a SAKHI caller: every Sakhi's own JWT
   * carries a projectId too, so without this early return a Sakhi whose own
   * `sakhi_profiles.primaryProjectId` doesn't happen to equal their JWT's
   * projectId claim would be wrongly 403'd fetching their own record.
   */
  async getById(id: string, caller: CallerScope) {
    if (!isPrivileged(caller) && caller.roles.includes('SAKHI')) {
      if (caller.id !== id) {
        throw forbidden('A Sakhi may only view their own profile.');
      }
      const ownProfile = await this.repository.findById(id);
      if (!ownProfile) throw notFound('Sakhi not found.');
      return toApiSakhi(ownProfile as unknown as Record<string, unknown>);
    }
    const profile = await this.repository.findById(id);
    if (!profile) throw notFound('Sakhi not found.');
    if (caller.projectId && caller.projectId !== profile.primaryProjectId) {
      throw forbidden('You do not have access to this Sakhi.');
    }
    return toApiSakhi(profile as unknown as Record<string, unknown>);
  }

  /**
   * Batch lookup for `GET /sakhis/by-ids`, backing Quick Response's
   * page-level Sakhi name resolution (one call per page instead of one per
   * card). An id outside the caller's project scope, or simply not found, is
   * silently absent from the result rather than a 404/403 — a caller-supplied
   * id list is never assumed pre-scoped, matching
   * BeneficiaryClient.getManyWithRisk's contract on the beneficiary side.
   * MANAGER/ADMIN are unrestricted, matching listByProject/getById above.
   */
  async getManyByIds(ids: string[], caller: CallerScope) {
    if (ids.length === 0) return [];
    const profiles = await this.repository.findManyByIds(ids);
    const mapped = profiles.map((p) => toApiSakhi(p as unknown as Record<string, unknown>));
    if (isPrivileged(caller)) {
      return mapped;
    }
    return mapped.filter((s) => s.primaryProjectId === caller.projectId);
  }

  /**
   * CR-XXX: the Sakhi's own currently-active village/pada assignments —
   * consumed by visit-form-service's `GET /forms/:formCode/active-version`
   * to union geography ancestor chains across every pada a Sakhi covers,
   * instead of the single geographyUnitId the JWT carries. Same
   * ownership rule as `getById`: a SAKHI caller may only fetch their own
   * assignments; a project-scoped caller (SUPERVISOR) may only fetch a
   * Sakhi within their own project; MANAGER/ADMIN/SYSTEM are unrestricted.
   * PR #238 review: the SAKHI self-check alone left a project-scoped
   * SUPERVISOR (neither SAKHI nor privileged) able to read any Sakhi's
   * assignments with no project check at all — this now fetches the
   * target Sakhi's profile first to enforce the same project-scope rule
   * `getById` already applies, rather than skipping straight to the query.
   */
  async getActiveLocationAssignments(sakhiId: string, caller: CallerScope, asOf: Date) {
    if (!isPrivileged(caller) && caller.roles.includes('SAKHI')) {
      if (caller.id !== sakhiId) {
        throw forbidden('A Sakhi may only view their own location assignments.');
      }
    } else if (!isPrivileged(caller)) {
      const profile = await this.repository.findById(sakhiId);
      if (!profile) throw notFound('Sakhi not found.');
      if (caller.projectId && caller.projectId !== profile.primaryProjectId) {
        throw forbidden('You do not have access to this Sakhi.');
      }
    }
    const rows = await this.repository.findActiveLocationAssignments(sakhiId, asOf);
    return rows.map((r) => ({
      villageId: r.villageId,
      padaId: r.padaId,
      effectiveFrom: r.effectiveFrom,
      effectiveTo: r.effectiveTo,
    }));
  }

  /**
   * Write access to a Sakhi's location assignments is ADMIN-unrestricted or
   * SUPERVISOR-own-project-only — never SAKHI (they have read-only access to
   * their own assignments via getActiveLocationAssignments above). Shared by
   * create/update/end since all three need the same "may this caller manage
   * this Sakhi's assignments at all" check before touching the row.
   *
   * Always fetches and returns the Sakhi's own profile (even for a
   * privileged caller who needs no project check) — createLocationAssignment
   * uses `primaryProjectId` from it to derive the assignment's projectId
   * server-side, rather than trusting a client-supplied projectId that could
   * name a project the Sakhi doesn't actually belong to (security review
   * finding: an unvalidated input.projectId let a caller create a location
   * assignment misattributed to an arbitrary project).
   *
   * Unlike getById/getActiveLocationAssignments's read-side project check
   * (`caller.projectId && caller.projectId !== profile.primaryProjectId`),
   * this write-side check does NOT treat a null caller.projectId as
   * unrestricted. Nothing prevents a SUPERVISOR-role user from being
   * created/left with `projectId: null` (auth.service.ts only requires a
   * projectId for SAKHI), so `caller.projectId &&` short-circuiting to false
   * would let such a SUPERVISOR mutate any Sakhi's assignments in any
   * project — a read-scope leak on the GET routes, but an unrestricted
   * cross-project write here (PR #240 review).
   */
  private async assertCallerCanManageAssignments(sakhiId: string, caller: CallerScope) {
    if (caller.roles.includes('SAKHI') && !isPrivileged(caller)) {
      throw forbidden('A Sakhi cannot manage location assignments.');
    }
    const profile = await this.repository.findById(sakhiId);
    if (!profile) throw notFound('Sakhi not found.');
    if (!isPrivileged(caller) && caller.projectId !== profile.primaryProjectId) {
      throw forbidden('You do not have access to this Sakhi.');
    }
    return profile;
  }

  /**
   * Validates villageId (must be an ACTIVE geography_units row with geoType
   * VILLAGE) and, if given, padaId (ACTIVE, geoType PADA, and its own
   * parentId must equal villageId — a pada belonging to a different village
   * than the one supplied would silently produce a geographically
   * inconsistent assignment otherwise).
   */
  private async assertValidVillageAndPada(villageId: string, padaId: string | undefined | null) {
    // The village and pada lookups don't depend on each other, so they run
    // concurrently rather than sequentially (PR #240 review: halves the
    // added latency on every create and every geography-changing update).
    const [village, pada] = await Promise.all([
      this.geographyRepository.findById(villageId),
      padaId ? this.geographyRepository.findById(padaId) : Promise.resolve(null),
    ]);
    if (!village || village.geoType !== 'VILLAGE' || village.status !== 'ACTIVE') {
      throw badRequest('villageId: Must reference an active VILLAGE geography unit.');
    }
    if (padaId) {
      this.assertPadaBelongsToVillage(pada, villageId);
    }
  }

  /** Shared by assertValidVillageAndPada and the padaId-only update path below. */
  private assertPadaBelongsToVillage(
    pada: { geoType: string; status: string; parentId: string | null } | null,
    villageId: string,
  ) {
    if (!pada || pada.geoType !== 'PADA' || pada.status !== 'ACTIVE') {
      throw badRequest('padaId: Must reference an active PADA geography unit.');
    }
    if (pada.parentId !== villageId) {
      throw badRequest('padaId: Must be a child of the given villageId.');
    }
  }

  /**
   * Validates a new padaId against an already-known-valid villageId, without
   * re-checking the village itself — used when an update only touches padaId
   * (village unchanged), so an unrelated village deactivation after the
   * assignment was created doesn't retroactively 400 an edit that never
   * touched villageId (PR #240 review).
   */
  private async assertValidPadaForExistingVillage(villageId: string, padaId: string) {
    const pada = await this.geographyRepository.findById(padaId);
    this.assertPadaBelongsToVillage(pada, villageId);
  }

  /**
   * Creates a new village/pada assignment for a Sakhi. No overlap check
   * against the Sakhi's existing assignments — a Sakhi may hold multiple
   * concurrent assignments spanning any geography, including different
   * districts or states (this is the whole point of CR-237's multi-pada
   * union fix); layering date ranges for the same village/pada is likewise
   * left unrestricted, per explicit product decision.
   *
   * `projectId` is derived from the Sakhi's own `sakhi_profiles.primaryProjectId`
   * (via assertCallerCanManageAssignments's profile fetch), not accepted as
   * client input — a caller-supplied projectId could otherwise name a
   * project the Sakhi doesn't actually belong to (security review finding).
   */
  async createLocationAssignment(
    sakhiId: string,
    input: CreateLocationAssignmentInput,
    caller: CallerScope,
  ) {
    const profile = await this.assertCallerCanManageAssignments(sakhiId, caller);
    await this.assertValidVillageAndPada(input.villageId, input.padaId);
    if (input.effectiveTo && input.effectiveTo < input.effectiveFrom) {
      throw badRequest('effectiveTo: Must not be before effectiveFrom.');
    }
    const created = await this.repository.createLocationAssignment({
      sakhiId,
      projectId: profile.primaryProjectId,
      villageId: input.villageId,
      padaId: input.padaId ?? null,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo ?? null,
    });
    return toApiLocationAssignment(created);
  }

  /**
   * Edits an existing assignment's villageId/padaId/effectiveFrom/effectiveTo.
   * `assignmentId` must belong to `sakhiId` — checked here (not left to the
   * database) so a caller cannot edit another Sakhi's assignment by guessing
   * an id and supplying an unrelated sakhiId in the URL; a mismatch 404s
   * rather than leaking whether the assignmentId exists at all.
   */
  async updateLocationAssignment(
    sakhiId: string,
    assignmentId: string,
    input: UpdateLocationAssignmentInput,
    caller: CallerScope,
  ) {
    await this.assertCallerCanManageAssignments(sakhiId, caller);
    const existing = await this.repository.findLocationAssignmentById(assignmentId);
    if (!existing || existing.sakhiId !== sakhiId) {
      throw notFound('Location assignment not found.');
    }
    const nextVillageId = input.villageId ?? existing.villageId;
    const nextPadaId = input.padaId === undefined ? existing.padaId : input.padaId;
    // Only re-validate villageId when it's actually being changed — otherwise
    // an edit that touches only padaId (village unchanged) re-checks the
    // Sakhi's existing, already-valid villageId too, and wrongly 400s if that
    // village was deactivated after the assignment was created (PR #240
    // review). padaId is still (re)validated whenever either field changes,
    // since a new villageId can invalidate an unchanged padaId's parentage.
    if (input.villageId && input.villageId !== existing.villageId) {
      await this.assertValidVillageAndPada(nextVillageId, nextPadaId);
    } else if (input.padaId !== undefined && nextPadaId) {
      await this.assertValidPadaForExistingVillage(nextVillageId, nextPadaId);
    }
    const nextFrom = input.effectiveFrom ?? existing.effectiveFrom;
    const nextTo = input.effectiveTo === undefined ? existing.effectiveTo : input.effectiveTo;
    if (nextTo && nextTo < nextFrom) {
      throw badRequest('effectiveTo: Must not be before effectiveFrom.');
    }
    const updated = await this.repository.updateLocationAssignment(assignmentId, {
      villageId: input.villageId,
      padaId: input.padaId,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: input.effectiveTo,
    });
    return toApiLocationAssignment(updated);
  }

  /**
   * "Ends" an assignment by setting effectiveTo (defaulting to today) —
   * see sakhi.repository.ts's endLocationAssignment doc comment for why this
   * table has no delete/deactivate flag to use instead.
   */
  async endLocationAssignment(
    sakhiId: string,
    assignmentId: string,
    effectiveTo: Date | null | undefined,
    caller: CallerScope,
  ) {
    await this.assertCallerCanManageAssignments(sakhiId, caller);
    const existing = await this.repository.findLocationAssignmentById(assignmentId);
    if (!existing || existing.sakhiId !== sakhiId) {
      throw notFound('Location assignment not found.');
    }
    const resolvedEffectiveTo = effectiveTo ?? new Date();
    // effectiveTo/effectiveFrom are `@db.Date` columns — Postgres truncates
    // the write to a plain date under the session timezone, which can
    // disagree with an in-memory full-timestamp comparison near a UTC day
    // boundary (PR #240 review). Truncate both sides to UTC midnight first
    // so this guard matches what's actually persisted.
    if (startOfUTCDay(resolvedEffectiveTo) < startOfUTCDay(existing.effectiveFrom)) {
      throw badRequest("effectiveTo: Must not be before the assignment's effectiveFrom.");
    }
    const updated = await this.repository.endLocationAssignment(assignmentId, resolvedEffectiveTo);
    return toApiLocationAssignment(updated);
  }
}
