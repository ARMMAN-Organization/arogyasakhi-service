import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { ArogyaSakhiRosterRepository } from './arogya-sakhi-roster.repository';
import { ArogyaSakhiRosterService } from './arogya-sakhi-roster.service';
import { registerArogyaSakhiRosterRoutes } from './arogya-sakhi-roster.routes';

/** Composition root for the Sakhi roster download feature: wires repository → service → routes. */
export function createArogyaSakhiRosterModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const repository = new ArogyaSakhiRosterRepository(prisma);
  const service = new ArogyaSakhiRosterService(repository);
  const doc = createDocumentedRouter();
  registerArogyaSakhiRosterRoutes(doc, service, signer);
  return doc;
}
