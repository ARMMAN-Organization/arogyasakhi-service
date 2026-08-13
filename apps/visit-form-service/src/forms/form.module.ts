import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { FormRepository } from './form.repository';
import { FormService } from './form.service';
import { registerFormRoutes } from './form.routes';

/** Composition root for the forms feature: wires repository -> service -> routes. */
export function createFormModule(prisma: PrismaService): DocumentedRouter {
  const repository = new FormRepository(prisma);
  const service = new FormService(repository);
  const doc = createDocumentedRouter();
  registerFormRoutes(doc, service);
  return doc;
}
