import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { IncentiveEventRepository } from './incentiveEvent.repository';
import { IncentiveEventService } from './incentiveEvent.service';
import { createIncentiveEventRouter } from './incentiveEvent.controller';
import { IncentiveRateRepository } from '../rates/incentiveRate.repository';

/**
 * Composition root for the incentives feature: wires repository → service →
 * router. Replaces the former NestJS module + DI container.
 */
export function createIncentiveEventModule(prisma: PrismaService): DocumentedRouter {
  const repository = new IncentiveEventRepository(prisma);
  const rateRepository = new IncentiveRateRepository(prisma);
  const service = new IncentiveEventService(repository, rateRepository);
  return createIncentiveEventRouter(service);
}
