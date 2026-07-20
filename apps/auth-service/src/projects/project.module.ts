import type { DocumentedRouter, TokenSigner } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { ProjectRepository } from './project.repository';
import { ProjectService } from './project.service';
import { createProjectRouter } from './project.controller';

/** Composition root for the project/funder feature: wires repository → service → router. */
export function createProjectModule(prisma: PrismaService, signer: TokenSigner): DocumentedRouter {
  const repository = new ProjectRepository(prisma);
  const service = new ProjectService(repository);
  return createProjectRouter(service, signer);
}
