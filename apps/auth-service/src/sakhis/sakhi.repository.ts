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

  /**
   * Batch lookup for `GET /sakhis/by-ids` — one query for a whole page of
   * `userId`s instead of one call per id (see sakhi.service.ts's getByIds).
   * `userIds` is intersected with `scoping` in the WHERE clause, so an
   * out-of-scope or nonexistent id is silently absent from the result,
   * never a 403/404 — same reasoning as beneficiary-service's
   * findByIdsWithRisk (never let a caller-supplied id list reveal via an
   * error whether an out-of-scope id exists).
   */
  findByIds(userIds: string[], scoping: { projectId?: string }) {
    if (userIds.length === 0) return Promise.resolve([]);
    return this.prisma.sakhiProfile.findMany({
      where: {
        userId: { in: userIds },
        isDeleted: false,
        ...(scoping.projectId ? { primaryProjectId: scoping.projectId } : {}),
      },
      include: { user: true },
    });
  }
}
