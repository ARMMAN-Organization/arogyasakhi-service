import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { LookupRepository } from './lookup.repository';
import { LookupService } from './lookup.service';
import { registerLookupRoutes } from './lookup.routes';
import { registerMasterDataAliasRoutes } from './master-data-alias.routes';

/** Composition root for the lookup feature: wires repository → service → routes. */
export function createLookupModule(prisma: PrismaService, signer: TokenSigner): DocumentedRouter {
  const repository = new LookupRepository(prisma);
  const service = new LookupService(repository);
  const doc = createDocumentedRouter();
  registerLookupRoutes(doc, service, signer);
  registerMasterDataAliasRoutes(doc, service, signer);
  return doc;
}
