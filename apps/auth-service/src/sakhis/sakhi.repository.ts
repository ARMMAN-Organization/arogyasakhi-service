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
   * means `effectiveFrom <= asOf` and (`effectiveTo` is null or `>= asOf`).
   */
  findActiveLocationAssignments(sakhiId: string, asOf: Date) {
    return this.prisma.sakhiLocationAssignment.findMany({
      where: {
        sakhiId,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
    });
  }
}
