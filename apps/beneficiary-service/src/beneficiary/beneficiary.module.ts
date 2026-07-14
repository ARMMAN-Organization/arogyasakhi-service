import type { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { BeneficiaryRepository } from './beneficiary.repository';
import { BeneficiaryService } from './beneficiary.service';
import { createBeneficiaryRouter } from './beneficiary.controller';

/**
 * Composition root for the beneficiary feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createBeneficiaryModule(prisma: PrismaService): Router {
  const repository = new BeneficiaryRepository(prisma);
  const service = new BeneficiaryService(repository);
  return createBeneficiaryRouter(service);
}
