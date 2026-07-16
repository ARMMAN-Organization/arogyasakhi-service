import type { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { FormRepository } from './form.repository';
import { FormService } from './form.service';
import { createFormRouter } from './form.controller';

/** Composition root for the forms feature: wires repository -> service -> router. */
export function createFormModule(prisma: PrismaService): Router {
  const repository = new FormRepository(prisma);
  const service = new FormService(repository);
  return createFormRouter(service);
}
