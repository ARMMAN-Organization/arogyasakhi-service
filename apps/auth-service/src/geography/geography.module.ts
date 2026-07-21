import type { DocumentedRouter, TokenSigner } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { GeographyRepository } from './geography.repository';
import { GeographyService } from './geography.service';
import { createGeographyRouter } from './geography.controller';

/** Composition root for the geography feature: wires repository → service → router. */
export function createGeographyModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const repository = new GeographyRepository(prisma);
  const service = new GeographyService(repository);
  return createGeographyRouter(service, signer);
}
