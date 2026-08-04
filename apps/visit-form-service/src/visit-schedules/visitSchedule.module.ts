import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { VisitScheduleRepository } from './visitSchedule.repository';
import { VisitScheduleService } from './visitSchedule.service';
import { createVisitScheduleRouter } from './visitSchedule.controller';

/** Composition root for the visit-schedules feature: wires repository → service → router. */
export function createVisitScheduleModule(prisma: PrismaService): DocumentedRouter {
  const repository = new VisitScheduleRepository(prisma);
  const service = new VisitScheduleService(repository);
  return createVisitScheduleRouter(service);
}
