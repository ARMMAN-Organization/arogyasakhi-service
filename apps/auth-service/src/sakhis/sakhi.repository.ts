import type { PrismaService } from '../prisma/prisma.service';

/** Data access for Sakhi profile reads (project-scoped list, single lookup). */
export class SakhiRepository {
  constructor(private readonly prisma: PrismaService) {}

  findByProject(projectId: string) {
    return this.prisma.sakhiProfile.findMany({
      where: { primaryProjectId: projectId, isDeleted: false },
      include: { user: true },
      orderBy: { user: { displayName: 'asc' } },
    });
  }

  /** `userId` here is the Sakhi's `users.user_id` — the id `GET /sakhis/:sakhiId`
   * takes and the id `toApiSakhi()` returns as `sakhiId`, not the
   * `sakhi_profiles` row's own PK (see sakhi.service.ts's `toApiSakhi` comment). */
  findById(userId: string) {
    return this.prisma.sakhiProfile.findFirst({
      where: { userId, isDeleted: false },
      include: { user: true },
    });
  }

  /** Batch lookup by `users.user_id`, for `GET /sakhis/by-ids` — see `findById`. */
  findManyByIds(userIds: string[]) {
    return this.prisma.sakhiProfile.findMany({
      where: { userId: { in: userIds }, isDeleted: false },
      include: { user: true },
    });
  }

  /**
   * A Sakhi's currently-active village/pada assignments (CR-XXX: a Sakhi
   * covering multiple padas has one `sakhi_location_assignments` row per
   * pada — the JWT's single `geographyUnitId` claim only ever reflects one
   * of them, which is why `GET /forms/:formCode/active-version`'s geography
   * array previously dropped every pada but that one). "Currently active"
   * means `effectiveFrom <= asOf` and (`effectiveTo` is null or `>= asOf`),
   * AND (statusLookupId is null — see below).
   *
   * PR #238 review: `statusLookupId` (nullable, no lookup category defined
   * anywhere yet — no seed/migration/service writes it today) is
   * excluded defensively here rather than left unchecked. Nothing sets a
   * non-null value today, so this changes no current behavior, but a
   * future "revoke this assignment" write path (the column's existence
   * suggests one is planned) would otherwise silently leak a
   * revoked/cancelled row into the Sakhi's unioned geography chain if this
   * method didn't already exclude it. Revisit once an actual lookup
   * category/values exist for this column, to filter on the real
   * active/inactive value rather than mere presence.
   */
  findActiveLocationAssignments(sakhiId: string, asOf: Date) {
    return this.prisma.sakhiLocationAssignment.findMany({
      where: {
        sakhiId,
        statusLookupId: null,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
    });
  }

  /** A single location assignment by its own id, regardless of Sakhi — the
   * service checks `sakhiId` matches the route param before returning it, so
   * a mismatched pair (assignmentId belonging to a different Sakhi) 404s
   * rather than leaking cross-Sakhi existence via a 403. */
  findLocationAssignmentById(assignmentId: string) {
    return this.prisma.sakhiLocationAssignment.findUnique({
      where: { id: assignmentId },
    });
  }

  createLocationAssignment(data: {
    sakhiId: string;
    projectId: string;
    villageId: string;
    padaId: string | null;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }) {
    return this.prisma.sakhiLocationAssignment.create({ data });
  }

  updateLocationAssignment(
    assignmentId: string,
    data: {
      villageId?: string;
      padaId?: string | null;
      effectiveFrom?: Date;
      effectiveTo?: Date | null;
    },
  ) {
    return this.prisma.sakhiLocationAssignment.update({
      where: { id: assignmentId },
      data,
    });
  }

  /** "Ending" an assignment sets effectiveTo — this table has no delete flag
   * (statusLookupId is a separate, currently-unused concept; see
   * findActiveLocationAssignments's doc comment) and no isDeleted column
   * (unlike most tables in this codebase — the ERD gives this table no audit
   * columns at all), so a closed date range is the only "inactive" signal
   * available today. */
  endLocationAssignment(assignmentId: string, effectiveTo: Date) {
    return this.prisma.sakhiLocationAssignment.update({
      where: { id: assignmentId },
      data: { effectiveTo },
    });
  }
}
