import { forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { RegistrationTargetRepository } from './registration-target.repository';
import type { SakhiRepository } from '../sakhis/sakhi.repository';

/**
 * Response is projected to exactly the fields the API documents
 * (registrationTargetSchema in registration-target.routes.ts), dropping
 * internal audit/soft-delete columns (createdByUserId, updatedByUserId,
 * isDeleted, deletedAt), matching project-geography.repository.ts's
 * `toApiProjectGeography` convention.
 */
function toApiRegistrationTarget(row: Record<string, unknown>) {
  return {
    id: row.id,
    sakhiId: row.sakhiId,
    projectId: row.projectId,
    targetPeriodStart: row.targetPeriodStart,
    targetPeriodEnd: row.targetPeriodEnd,
    registrationTarget: row.registrationTarget,
  };
}

/** MANAGER and ADMIN are unrestricted — matches sakhi.service.ts's isPrivileged. */
function isPrivileged(caller: AuthenticatedUser): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

/** Business logic for Sakhi-grain registration target reads. */
export class RegistrationTargetService {
  constructor(
    private readonly repository: RegistrationTargetRepository,
    private readonly sakhiRepository: SakhiRepository,
  ) {}

  /**
   * All target rows for a Sakhi. A SAKHI caller may only request her own
   * id; a SUPERVISOR only a Sakhi assigned to them (`supervisorId ===
   * caller.id`, resolved via `sakhi.repository.ts` — same table, same
   * service, an in-process lookup rather than a cross-service call).
   * MANAGER/ADMIN are unscoped. Same ownership rule as
   * `sakhi.service.ts`'s `getById`.
   */
  async list(sakhiId: string, caller: AuthenticatedUser) {
    if (!isPrivileged(caller)) {
      if (caller.roles.includes('SAKHI') && sakhiId !== caller.id) {
        throw forbidden('You do not have access to this Sakhi.');
      }
      if (caller.roles.includes('SUPERVISOR')) {
        const sakhi = await this.sakhiRepository.findById(sakhiId);
        if (!sakhi) throw notFound('Sakhi not found.');
        if (sakhi.supervisorId !== caller.id) {
          throw forbidden('You do not have access to this Sakhi.');
        }
      }
    }

    const rows = await this.repository.findBySakhiId(sakhiId);
    return rows.map((r) => toApiRegistrationTarget(r as unknown as Record<string, unknown>));
  }
}
