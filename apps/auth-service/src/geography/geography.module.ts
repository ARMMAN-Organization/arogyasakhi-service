import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { GeographyRepository } from './geography.repository';
import { GeographyService } from './geography.service';
import { registerGeographyRoutes } from './geography.routes';

/** Composition root for the geography feature: wires repository → service → routes. */
export function createGeographyModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const repository = new GeographyRepository(prisma);
  const service = new GeographyService(repository);
  const doc = createDocumentedRouter();
  registerGeographyRoutes(doc, service, signer);
  return doc;
}
