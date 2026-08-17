import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { ProjectGeographyRepository } from './project-geography.repository';
import { ProjectGeographyService } from './project-geography.service';
import { registerProjectGeographyRoutes } from './project-geography.routes';

/** Composition root for the project-geography feature: wires repository → service → routes. */
export function createProjectGeographyModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const repository = new ProjectGeographyRepository(prisma);
  const service = new ProjectGeographyService(repository);
  const doc = createDocumentedRouter();
  registerProjectGeographyRoutes(doc, service, signer);
  return doc;
}
