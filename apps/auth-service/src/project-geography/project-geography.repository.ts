import type { PrismaService } from '../prisma/prisma.service';

/** Data access for project↔geography-unit scoping. */
export class ProjectGeographyRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Rows active as of `asOf` for a project — `activeFrom` at or before `asOf`,
   * and either open-ended (`activeTo: null`) or not yet ended. Matches the
   * same active-window shape as incentiveRate.repository.ts's findActiveRate.
   */
  findActiveByProjectId(projectId: string, asOf: Date) {
    return this.prisma.projectGeography.findMany({
      where: {
        projectId,
        isDeleted: false,
        activeFrom: { lte: asOf },
        OR: [{ activeTo: null }, { activeTo: { gte: asOf } }],
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}
