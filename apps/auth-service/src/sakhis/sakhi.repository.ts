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
}
