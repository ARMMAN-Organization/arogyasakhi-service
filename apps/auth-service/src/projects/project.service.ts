import { conflict, notFound } from '@armman/service-commons';
import type { ProjectRepository } from './project.repository';
import type { CreateFunderInput } from './dto/create-funder.dto';
import type { CreateProjectInput } from './dto/create-project.dto';
import type { UpdateProjectInput } from './dto/update-project.dto';

/** The calling principal's own scope, as carried on their JWT/trusted-identity headers. */
export interface CallerScope {
  readonly roles: string[];
  readonly projectId: string | null;
}

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

/**
 * MANAGER and ADMIN are unrestricted across all project-scoping checks —
 * checked as the absence of an elevated role, not the presence of a
 * restrictive one (SAKHI/SUPERVISOR), since a caller can hold multiple
 * role assignments at once (see auth.service.ts's issueTokens) and must
 * not be scoped down just because one of their roles is restrictive.
 * Matches the same isPrivileged() pattern in
 * supervisor-operations-service/operations.service.ts.
 */
function isPrivileged(caller: CallerScope): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

/** Business logic for project/funder master data. */
export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  /**
   * A caller with a project scope on their JWT (SAKHI/SUPERVISOR — one
   * project per person per the SRS) only ever sees their own project. A
   * privileged caller (MANAGER/ADMIN, who oversee multiple projects) is
   * unrestricted. This prevents a SAKHI/SUPERVISOR client from picking a
   * project it has no access to out of an unscoped list and then 403ing
   * on a follow-up call (e.g. GET /projects/:id/sakhis).
   */
  async list(caller: CallerScope) {
    const projects = await this.repository.findManyActiveProjects();
    const mapped = projects.map((p) => toApiProject(p as unknown as Record<string, unknown>));
    if (isPrivileged(caller)) {
      return mapped;
    }
    return mapped.filter((p) => p.projectId === caller.projectId);
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
