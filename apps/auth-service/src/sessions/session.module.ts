import type { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { SessionRepository } from './session.repository';
import { SessionService } from './session.service';
import { createSessionRouter } from './session.controller';

/**
 * Composition root for the sessions feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createSessionModule(prisma: PrismaService): Router {
  const repository = new SessionRepository(prisma);
  const service = new SessionService(repository);
  return createSessionRouter(service);
}
