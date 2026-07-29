import type { DocumentedRouter, TokenSigner } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { SakhiRepository } from './sakhi.repository';
import { SakhiService } from './sakhi.service';
import { createSakhiRouter } from './sakhi.controller';

/** Composition root for the Sakhi-read feature: wires repository → service → router. */
export function createSakhiModule(prisma: PrismaService, signer: TokenSigner): DocumentedRouter {
  const repository = new SakhiRepository(prisma);
  const service = new SakhiService(repository);
  return createSakhiRouter(service, signer);
}
