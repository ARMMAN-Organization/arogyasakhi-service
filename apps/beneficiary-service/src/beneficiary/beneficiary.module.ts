import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { BeneficiaryRepository } from './beneficiary.repository';
import { BeneficiaryService } from './beneficiary.service';
import { registerBeneficiaryRoutes } from './beneficiary.routes';

/**
 * Composition root for the beneficiary feature: wires repository → service → routes.
 * Replaces the former NestJS module + DI container.
 */
export function createBeneficiaryModule(prisma: PrismaService): DocumentedRouter {
  const repository = new BeneficiaryRepository(prisma);
  const service = new BeneficiaryService(repository);
  const doc = createDocumentedRouter();
  registerBeneficiaryRoutes(doc, service);
  return doc;
}
