import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { SakhiRepository } from './sakhi.repository';
import { SakhiService } from './sakhi.service';
import { registerSakhiRoutes } from './sakhi.routes';

/** Composition root for the Sakhi-read feature: wires repository → service → routes. */
export function createSakhiModule(prisma: PrismaService, signer: TokenSigner): DocumentedRouter {
  const repository = new SakhiRepository(prisma);
  const service = new SakhiService(repository);
  const doc = createDocumentedRouter();
  registerSakhiRoutes(doc, service, signer);
  return doc;
}
