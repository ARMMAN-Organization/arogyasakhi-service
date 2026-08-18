import type { PrismaService } from '../prisma/prisma.service';

/** Data access for the Sakhi roster download (project-scoped list). */
export class ArogyaSakhiRosterRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every non-deleted Sakhi profile under a project, joined to `User` for
   * display fields. Same filter shape as sakhi.repository.ts's
   * `findByProject` — this is a deliberately separate query (not a shared
   * import) since the two endpoints project different response shapes and
   * may evolve independently (see arogya-sakhi-roster.service.ts).
   */
  findByProject(projectId: string) {
    return this.prisma.sakhiProfile.findMany({
      where: { primaryProjectId: projectId, isDeleted: false },
      include: { user: true },
      orderBy: { user: { displayName: 'asc' } },
    });
  }
}
