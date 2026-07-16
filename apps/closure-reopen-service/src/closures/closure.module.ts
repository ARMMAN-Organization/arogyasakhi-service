import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { ClosureRepository } from './closure.repository';
import { ClosureService } from './closure.service';
import { createClosureRouter } from './closure.controller';

/**
 * Composition root for the closures feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createClosureModule(prisma: PrismaService): DocumentedRouter {
  const repository = new ClosureRepository(prisma);
  const service = new ClosureService(repository);
  return createClosureRouter(service);
}
