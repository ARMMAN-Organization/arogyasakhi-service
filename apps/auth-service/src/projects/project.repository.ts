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
