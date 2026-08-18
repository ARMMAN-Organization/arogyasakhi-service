import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { VisitMasterRepository } from './visitMaster.repository';
import { VisitMasterService } from './visitMaster.service';
import { registerVisitMasterRoutes } from './visitMaster.routes';

/** Composition root for the visit-masters feature: wires repository -> service -> routes. */
export function createVisitMasterModule(prisma: PrismaService): DocumentedRouter {
  const repository = new VisitMasterRepository(prisma);
  const service = new VisitMasterService(repository);
  const doc = createDocumentedRouter();
  registerVisitMasterRoutes(doc, service);
  return doc;
}
