import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { ReopenRequestRepository } from './reopen-request.repository';
import { ReopenRequestService } from './reopen-request.service';
import { createReopenRequestRouter } from './reopen-request.controller';

/**
 * Composition root for the reopen-requests feature: wires repository → service → router.
 */
export function createReopenRequestModule(prisma: PrismaService): DocumentedRouter {
  const repository = new ReopenRequestRepository(prisma);
  const service = new ReopenRequestService(repository);
  return createReopenRequestRouter(service);
}
