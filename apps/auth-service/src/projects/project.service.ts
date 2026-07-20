import { conflict, notFound } from '@armman/service-commons';
import type { ProjectRepository } from './project.repository';
import type { CreateFunderInput } from './dto/create-funder.dto';
import type { CreateProjectInput } from './dto/create-project.dto';
import type { UpdateProjectInput } from './dto/update-project.dto';

/** Prisma unique-constraint violation code (projectCode/funderCode). */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

/** Business logic for project/funder master data. */
export class ProjectService {
  constructor(private readonly repository: ProjectRepository) {}

  list() {
    return this.repository.findManyActiveProjects();
  }

  async getById(id: string) {
    const project = await this.repository.findProjectById(id);
    if (!project) throw notFound('Project not found.');
    return project;
  }

  async create(input: CreateProjectInput) {
    try {
      return await this.repository.createProject(input);
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
    return updated;
  }

  listFunders() {
    return this.repository.findManyFunders();
  }

  async createFunder(input: CreateFunderInput) {
    try {
      return await this.repository.createFunder(input);
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
