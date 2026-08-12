import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { IncentiveRateRepository } from './incentiveRate.repository';
import { IncentiveRateService } from './incentiveRate.service';
import { registerIncentiveRateRoutes } from './incentiveRate.routes';

/**
 * Composition root for the incentive-rates feature: wires repository →
 * service → routes.
 */
export function createIncentiveRateModule(prisma: PrismaService): DocumentedRouter {
  const repository = new IncentiveRateRepository(prisma);
  const service = new IncentiveRateService(repository);
  const doc = createDocumentedRouter();
  registerIncentiveRateRoutes(doc, service);
  return doc;
}
