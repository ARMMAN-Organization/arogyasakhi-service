import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationsRepository } from './operations.repository';
import { OperationsService } from './operations.service';
import { createOperationsRouter } from './operations.controller';

/**
 * Composition root for the supervisor-operations feature: wires repository →
 * service → router. Returns the DocumentedRouter (exposes both `.router` and
 * `.registry`), consumed by createApp().
 */
export function createOperationsModule(prisma: PrismaService): DocumentedRouter {
  const repository = new OperationsRepository(prisma);
  const service = new OperationsService(repository);
  return createOperationsRouter(service);
}
