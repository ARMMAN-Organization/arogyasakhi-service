import { conflict, notFound } from '@armman/service-commons';
import type { ProjectRepository } from './project.repository';
import type { CreateFunderInput } from './dto/create-funder.dto';
import type { CreateProjectInput } from './dto/create-project.dto';
import type { UpdateProjectInput } from './dto/update-project.dto';

/** Prisma unique-constraint violation code (projectCode/funderCode). */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

/**
 * Project/funder responses are projected to EXACTLY the fields the API
 * documents (funderSchema/projectSchema in project.controller.ts) so internal
 * audit/soft-delete columns (createdByUserId, updatedByUserId, isDeleted,
 * deletedAt, createdAt, updatedAt) never leak into a response.
 */
function toApiFunder(f: Record<string, unknown> | null) {
  if (!f) return null;
  return {
    funderId: f.funderId,
    funderCode: f.funderCode,
    funderName: f.funderName,
    status: f.status,
  };
}

function toApiProject(p: Record<string, unknown>) {
  return {
    projectId: p.projectId,
    funderId: p.funderId,
    funder: toApiFunder(p.funder as Record<string, unknown> | null),
    projectCode: p.projectCode,
    projectName: p.projectName,
    financialYear: p.financialYear,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status,
  };
}

/** Business logic for project/funder master data. */
export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  async list() {
    const projects = await this.repository.findManyActiveProjects();
    return projects.map((p) => toApiProject(p as unknown as Record<string, unknown>));
  }

  async getById(id: string) {
    const project = await this.repository.findProjectById(id);
    if (!project) throw notFound('Project not found.');
    return toApiProject(project as unknown as Record<string, unknown>);
  }

  async create(input: CreateProjectInput) {
    try {
      const created = await this.repository.createProject(input);
      return toApiProject(created as unknown as Record<string, unknown>);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict('A project with this project code already exists.');
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateProjectInput) {
    const updated = await this.repository.updateProject(id, input);
    if (!updated) throw notFound('Project not found.');
    return toApiProject(updated as unknown as Record<string, unknown>);
  }

  async listFunders() {
    const funders = await this.repository.findManyFunders();
    return funders.map((f) => toApiFunder(f as unknown as Record<string, unknown>));
  }

  async createFunder(input: CreateFunderInput) {
    try {
      const created = await this.repository.createFunder(input);
      return toApiFunder(created as unknown as Record<string, unknown>);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict('A funder with this funder code already exists.');
      }
      throw err;
    }
  }
}

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PRISMA_UNIQUE_CONSTRAINT_CODE
  );
}
