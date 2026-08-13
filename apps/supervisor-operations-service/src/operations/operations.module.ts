import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { OperationsRepository } from './operations.repository';
import { OperationsService } from './operations.service';
import { SakhiClient } from './sakhi.client';
import { registerCallLogsRoutes } from './callLogs.routes';
import { registerEventsRoutes } from './events.routes';
import { registerInventoryRoutes } from './inventory.routes';
import { registerGatheringsRoutes } from './gatherings.routes';
import { registerTrainingTopicsRoutes } from './trainingTopics.routes';

/**
 * Composition root for the supervisor-operations feature: wires repository →
 * service → routes. Returns the DocumentedRouter (exposes both `.router` and
 * `.registry`), consumed by createApp().
 *
 * All 5 sub-domains (call logs, events, inventory, gatherings, training
 * topics) register into this single shared `doc` — `createDocumentedRouter()`
 * produces exactly one OpenAPI registry per call, so splitting into
 * independently-created registries here would silently produce 5 incomplete
 * Swagger docs instead of 1 complete one.
 */
export function createOperationsModule(prisma: PrismaService): DocumentedRouter {
  const repository = new OperationsRepository(prisma);
  const sakhiClient = new SakhiClient();
  const service = new OperationsService(repository, sakhiClient);
  const doc = createDocumentedRouter();
  registerCallLogsRoutes(doc, service);
  registerEventsRoutes(doc, service);
  registerInventoryRoutes(doc, service);
  registerGatheringsRoutes(doc, service);
  registerTrainingTopicsRoutes(doc, service);
  return doc;
}
