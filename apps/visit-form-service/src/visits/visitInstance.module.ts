import type { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { VisitInstanceRepository } from './visitInstance.repository';
import { VisitInstanceService } from './visitInstance.service';
import { createVisitInstanceRouter } from './visitInstance.controller';

/**
 * Composition root for the visits feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createVisitInstanceModule(prisma: PrismaService): Router {
  const repository = new VisitInstanceRepository(prisma);
  const service = new VisitInstanceService(repository);
  return createVisitInstanceRouter(service);
}
