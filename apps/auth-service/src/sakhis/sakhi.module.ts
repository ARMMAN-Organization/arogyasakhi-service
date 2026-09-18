import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { GeographyRepository } from '../geography/geography.repository';
import { GeographyService } from '../geography/geography.service';
import { SakhiRepository } from './sakhi.repository';
import { SakhiService } from './sakhi.service';
import { registerSakhiRoutes } from './sakhi.routes';

/**
 * Composition root for the Sakhi feature: wires repository → service →
 * routes. GeographyService is also injected — SakhiService's location-
 * assignment writes validate villageId/padaId via
 * GeographyService.assertActiveUnitOfType (same prisma instance, so a
 * direct in-process reuse rather than an HTTP round-trip to the geography
 * routes), sharing the same "usable geography unit" definition
 * GeographyService.create already uses (PR #240 review).
 */
export function createSakhiModule(prisma: PrismaService, signer: TokenSigner): DocumentedRouter {
  const repository = new SakhiRepository(prisma);
  const geographyRepository = new GeographyRepository(prisma);
  const geographyService = new GeographyService(geographyRepository);
  const service = new SakhiService(repository, geographyService);
  const doc = createDocumentedRouter();
  registerSakhiRoutes(doc, service, signer);
  return doc;
}
