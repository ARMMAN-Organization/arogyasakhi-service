import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { ProjectRepository } from './project.repository';
import { ProjectService } from './project.service';
import { registerProjectRoutes } from './project.routes';

/** Composition root for the project/funder feature: wires repository → service → routes. */
export function createProjectModule(prisma: PrismaService, signer: TokenSigner): DocumentedRouter {
  const repository = new ProjectRepository(prisma);
  const service = new ProjectService(repository);
  const doc = createDocumentedRouter();
  registerProjectRoutes(doc, service, signer);
  return doc;
}
