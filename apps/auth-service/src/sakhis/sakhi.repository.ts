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

  findById(id: string) {
    return this.prisma.sakhiProfile.findFirst({
      where: { id, isDeleted: false },
      include: { user: true },
    });
  }
}
