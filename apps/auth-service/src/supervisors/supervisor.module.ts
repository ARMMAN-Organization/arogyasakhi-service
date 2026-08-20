import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { SupervisorRepository } from './supervisor.repository';
import { SupervisorService } from './supervisor.service';
import { registerSupervisorRoutes } from './supervisor.routes';

/**
 * Composition root for the Supervisor→Manager hierarchy link and TRANSFER
 * Manager-notice feature (FR-SV-4.3): wires repository → service → routes.
 */
export function createSupervisorModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const repository = new SupervisorRepository(prisma);
  const service = new SupervisorService(repository);
  const doc = createDocumentedRouter();
  registerSupervisorRoutes(doc, service, signer);
  return doc;
}
