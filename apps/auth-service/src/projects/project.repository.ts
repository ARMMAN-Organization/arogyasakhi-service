import type { PrismaService } from '../prisma/prisma.service';
import type { CreateFunderInput } from './dto/create-funder.dto';
import type { CreateProjectInput } from './dto/create-project.dto';
import type { UpdateProjectInput } from './dto/update-project.dto';

/** Data access for project/funder master data. */
export class ProjectRepository {
  constructor(private readonly prisma: PrismaService) {}

  findManyActiveProjects() {
    return this.prisma.project.findMany({
      where: { isDeleted: false, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
      include: { funder: true },
    });
  }

  findProjectById(id: string) {
    return this.prisma.project.findFirst({
      where: { projectId: id, isDeleted: false },
      include: { funder: true },
    });
  }

  createProject(data: CreateProjectInput) {
    return this.prisma.project.create({
      data: {
        funderId: data.funderId ?? null,
        projectCode: data.projectCode,
        projectName: data.projectName,
        financialYear: data.financialYear,
        startDate: data.startDate,
        endDate: data.endDate ?? null,
      },
      include: { funder: true },
    });
  }

  async updateProject(id: string, data: UpdateProjectInput) {
    const existing = await this.prisma.project.findFirst({
      where: { projectId: id, isDeleted: false },
    });
    if (!existing) return null;

    return this.prisma.project.update({
      where: { projectId: id },
      data,
      include: { funder: true },
    });
  }

  /**
   * All projects — including soft-deleted and non-ACTIVE rows, so a delta
   * client can tell a deletion/pause apart from "never existed" — with
   * `updatedAt` after `since` (or every row, when `since` is omitted).
   */
  findProjectsUpdatedSince(since: Date | undefined) {
    return this.prisma.project.findMany({
      where: since ? { updatedAt: { gt: since } } : undefined,
      orderBy: { updatedAt: 'asc' },
      include: { funder: true },
    });
  }

  /** Same as {@link findProjectsUpdatedSince}, for funders. */
  findFundersUpdatedSince(since: Date | undefined) {
    return this.prisma.funder.findMany({
      where: since ? { updatedAt: { gt: since } } : undefined,
      orderBy: { updatedAt: 'asc' },
    });
  }

  findManyFunders() {
    return this.prisma.funder.findMany({
      where: { isDeleted: false, status: 'ACTIVE' },
      orderBy: { createdAt: 'desc' },
    });
  }

  createFunder(data: CreateFunderInput) {
    return this.prisma.funder.create({ data });
  }
}
