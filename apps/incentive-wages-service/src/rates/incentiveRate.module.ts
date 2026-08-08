import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { IncentiveRateRepository } from './incentiveRate.repository';
import { IncentiveRateService } from './incentiveRate.service';
import { createIncentiveRateRouter } from './incentiveRate.controller';

/**
 * Composition root for the incentive-rates feature: wires repository →
 * service → router.
 */
export function createIncentiveRateModule(prisma: PrismaService): DocumentedRouter {
  const repository = new IncentiveRateRepository(prisma);
  const service = new IncentiveRateService(repository);
  return createIncentiveRateRouter(service);
}
