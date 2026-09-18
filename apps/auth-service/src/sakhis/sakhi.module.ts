import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { GeographyRepository } from '../geography/geography.repository';
import { SakhiRepository } from './sakhi.repository';
import { SakhiService } from './sakhi.service';
import { registerSakhiRoutes } from './sakhi.routes';

/**
 * Composition root for the Sakhi feature: wires repository → service →
 * routes. GeographyRepository is also injected — SakhiService's location-
 * assignment writes validate villageId/padaId against geography_units
 * before persisting (same prisma instance, same service, so a direct
 * repository reuse rather than an HTTP round-trip to the geography routes).
 */
export function createSakhiModule(prisma: PrismaService, signer: TokenSigner): DocumentedRouter {
  const repository = new SakhiRepository(prisma);
  const geographyRepository = new GeographyRepository(prisma);
  const service = new SakhiService(repository, geographyRepository);
  const doc = createDocumentedRouter();
  registerSakhiRoutes(doc, service, signer);
  return doc;
}
