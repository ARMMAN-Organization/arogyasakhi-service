import { forbidden } from '@armman/service-commons';
import type { ArogyaSakhiRosterRepository } from './arogya-sakhi-roster.repository';

/** The calling principal's own scope, as carried on their JWT/trusted-identity headers. */
export interface CallerScope {
  readonly id: string;
  readonly roles: string[];
  readonly projectId: string | null;
}

/**
 * Response is projected to a safe, flat subset for offline reference —
 * never the encrypted PII/financial fields on `SakhiProfile`
 * (panToken/aadhaarToken/bankAccountToken/ifscCode/backupContact) or
 * `passwordHash`. Unlike sakhi.service.ts's `toApiSakhi`, this returns the
 * `sakhi_profiles` row's own PK as `id` (this is a roster projection of that
 * table, not the cross-service Sakhi identity) alongside `userId` for
 * callers that need the `users.user_id` join key.
 */
function toApiRosterEntry(profile: Record<string, unknown>) {
  const user = profile.user as Record<string, unknown>;
  return {
    id: profile.id,
    userId: profile.userId,
    displayName: user.displayName,
    username: user.username,
    mobileNumber: profile.phoneNumber,
    employeeCode: profile.employeeCode,
    supervisorId: profile.supervisorId,
    primaryProjectId: profile.primaryProjectId,
    activeFrom: profile.activeFrom,
    activeTo: profile.activeTo,
    status: user.status,
  };
}

/** Business logic for the Sakhi roster download. */
export class ArogyaSakhiRosterService {
  constructor(private readonly repository: ArogyaSakhiRosterRepository) {}

  /**
   * A caller with a project scope on their JWT (typically SUPERVISOR — one
   * project per Supervisor per SRS) may only download that project's
   * roster; a privileged caller (MANAGER/ADMIN) is unrestricted, matching
   * sakhi.service.ts's `listByProject` project check. Unlike that endpoint,
   * the roster is a flat project-wide download for offline reference, not
   * an assignment list — it is not further filtered down to the caller's
   * own assigned Sakhis.
   */
  async listByProject(projectId: string, caller: CallerScope) {
    if (caller.projectId && caller.projectId !== projectId) {
      throw forbidden('You do not have access to this project.');
    }
    const profiles = await this.repository.findByProject(projectId);
    return profiles.map((p) => toApiRosterEntry(p as unknown as Record<string, unknown>));
  }
}
