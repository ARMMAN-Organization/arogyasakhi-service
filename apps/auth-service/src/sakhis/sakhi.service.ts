import { forbidden, notFound } from '@armman/service-commons';
import type { SakhiRepository } from './sakhi.repository';

/** The calling principal's own scope, as carried on their JWT/trusted-identity headers. */
export interface CallerScope {
  readonly projectId: string | null;
}

/**
 * Response is projected to a safe subset — never the encrypted PII tokens
 * (panToken/aadhaarToken/bankAccountToken), passwordHash, or other audit
 * columns. Combines User (identity) and SakhiProfile (program assignment)
 * fields, since a Sakhi is 1:1 across the two tables.
 */
function toApiSakhi(profile: Record<string, unknown>) {
  const user = profile.user as Record<string, unknown>;
  return {
    sakhiId: profile.id,
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

/** Business logic for Sakhi profile reads. */
export class SakhiService {
  constructor(private readonly repository: SakhiRepository) {}

  /**
   * A caller with a project scope on their JWT (typically SUPERVISOR — one
   * project per Supervisor per SRS) may only see that project's Sakhis. A
   * caller with no project scope (MANAGER/ADMIN, who oversee multiple
   * projects — HLD's dashboard "Project Selector") is unrestricted here.
   */
  async listByProject(projectId: string, caller: CallerScope) {
    if (caller.projectId && caller.projectId !== projectId) {
      throw forbidden('You do not have access to this project.');
    }
    const profiles = await this.repository.findByProject(projectId);
    return profiles.map((p) => toApiSakhi(p as unknown as Record<string, unknown>));
  }

  async getById(id: string, caller: CallerScope) {
    const profile = await this.repository.findById(id);
    if (!profile) throw notFound('Sakhi not found.');
    if (caller.projectId && caller.projectId !== profile.primaryProjectId) {
      throw forbidden('You do not have access to this Sakhi.');
    }
    return toApiSakhi(profile as unknown as Record<string, unknown>);
  }
}
