import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationsRepository } from './operations.repository';
import { OperationsService } from './operations.service';
import { SakhiClient } from './sakhi.client';
import { createOperationsRouter } from './operations.controller';

/**
 * Composition root for the supervisor-operations feature: wires repository →
 * service → router. Returns the DocumentedRouter (exposes both `.router` and
 * `.registry`), consumed by createApp().
 */
export function createOperationsModule(prisma: PrismaService): DocumentedRouter {
  const repository = new OperationsRepository(prisma);
  const sakhiClient = new SakhiClient();
  const service = new OperationsService(repository, sakhiClient);
  return createOperationsRouter(service);
}
