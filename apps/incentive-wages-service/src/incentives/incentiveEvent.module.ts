import type { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { IncentiveEventRepository } from './incentiveEvent.repository';
import { IncentiveEventService } from './incentiveEvent.service';
import { createIncentiveEventRouter } from './incentiveEvent.controller';

/**
 * Composition root for the incentives feature: wires repository → service →
 * router. Replaces the former NestJS module + DI container.
 */
export function createIncentiveEventModule(prisma: PrismaService): Router {
  const repository = new IncentiveEventRepository(prisma);
  const service = new IncentiveEventService(repository);
  return createIncentiveEventRouter(service);
}
