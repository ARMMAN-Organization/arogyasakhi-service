import type { DocumentedRouter, TokenSigner } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { LookupRepository } from './lookup.repository';
import { LookupService } from './lookup.service';
import { createLookupRouter } from './lookup.controller';

/** Composition root for the lookup feature: wires repository → service → router. */
export function createLookupModule(prisma: PrismaService, signer: TokenSigner): DocumentedRouter {
  const repository = new LookupRepository(prisma);
  const service = new LookupService(repository);
  return createLookupRouter(service, signer);
}
