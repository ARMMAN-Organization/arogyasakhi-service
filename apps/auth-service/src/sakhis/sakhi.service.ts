import { forbidden, notFound } from '@armman/service-commons';
import type { SakhiRepository } from './sakhi.repository';

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

/** Business logic for Sakhi profile reads. */
export class SakhiService {
  constructor(private readonly repository: SakhiRepository) {}

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
   *
   * A non-SAKHI, non-privileged (SUPERVISOR) caller is further scoped to
   * only their own assigned Sakhis (supervisorId === caller.id), matching
   * listByProject's own ownership check above — otherwise any Supervisor
   * sharing a project could fetch another Supervisor's Sakhi by id alone.
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
    if (isPrivileged(caller)) {
      return toApiSakhi(profile as unknown as Record<string, unknown>);
    }
    if ((profile as unknown as Record<string, unknown>).supervisorId !== caller.id) {
      throw forbidden('You do not have access to this Sakhi.');
    }
    return toApiSakhi(profile as unknown as Record<string, unknown>);
  }

  /**
   * Batch counterpart to getById — lets other services (via the gateway)
   * resolve display names for a page of records with one query instead of
   * an N-calls fan-out. Scoping matches getById's own non-SAKHI branch
   * exactly (project-only — a privileged caller is unrestricted, a
   * SUPERVISOR sees any Sakhi in their own project, not just Sakhis they
   * personally supervise; SAKHI-role self-only lookups have no batch use
   * case and aren't supported here). `ids` is caller-supplied and not
   * pre-scoped, so an out-of-scope or nonexistent id is silently dropped
   * from the result rather than surfaced as a 403/404 (same IDOR-safe
   * pattern as beneficiary-service's getByIdsWithRisk) — a batch call
   * legitimately spans Sakhis the caller may only partially have access to.
   */
  async getByIds(ids: string[], caller: CallerScope) {
    const scoping = isPrivileged(caller) ? {} : { projectId: caller.projectId ?? undefined };
    const profiles = await this.repository.findByIds(ids, scoping);
    return profiles.map((p) => toApiSakhi(p as unknown as Record<string, unknown>));
  }
}
