import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { RegistrationTargetRepository } from './registration-target.repository';
import { RegistrationTargetService } from './registration-target.service';
import { registerRegistrationTargetRoutes } from './registration-target.routes';

/** Composition root for the registration-target feature: wires repository → service → routes. */
export function createRegistrationTargetModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const repository = new RegistrationTargetRepository(prisma);
  const service = new RegistrationTargetService(repository);
  const doc = createDocumentedRouter();
  registerRegistrationTargetRoutes(doc, service, signer);
  return doc;
}
