import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { VisitScheduleRepository } from './visitSchedule.repository';
import { VisitScheduleService } from './visitSchedule.service';
import { registerVisitScheduleRoutes } from './visitSchedule.routes';

/** Composition root for the visit-schedules feature: wires repository → service → routes. */
export function createVisitScheduleModule(prisma: PrismaService): DocumentedRouter {
  const repository = new VisitScheduleRepository(prisma);
  const service = new VisitScheduleService(repository);
  const doc = createDocumentedRouter();
  registerVisitScheduleRoutes(doc, service);
  return doc;
}
