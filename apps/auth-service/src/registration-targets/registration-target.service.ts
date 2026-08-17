import type { RegistrationTargetRepository } from './registration-target.repository';

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

/** Business logic for Sakhi-grain registration target reads. */
export class RegistrationTargetService {
  constructor(private readonly repository: RegistrationTargetRepository) {}

  /**
   * All target rows for a Sakhi — an unknown/empty sakhiId simply yields an
   * empty array, not a 404, matching `project-geography.service.ts`'s
   * `list` (this service doesn't own the `sakhi_profiles` table's identity,
   * so it can't authoritatively distinguish "no such Sakhi" from "no
   * targets set yet").
   */
  async list(sakhiId: string) {
    const rows = await this.repository.findBySakhiId(sakhiId);
    return rows.map((r) => toApiRegistrationTarget(r as unknown as Record<string, unknown>));
  }
}
