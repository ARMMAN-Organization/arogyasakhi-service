import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { FormRepository } from './form.repository';
import { FormService } from './form.service';
import { registerFormRoutes } from './form.routes';
import { VisitInstanceRepository } from '../visits/visitInstance.repository';

/** Composition root for the forms feature: wires repository -> service -> routes. */
export function createFormModule(prisma: PrismaService): DocumentedRouter {
  const repository = new FormRepository(prisma);
  // BR-13's ccvOpeningRiskState.resolver.ts needs the beneficiary's own
  // completed-INC-visit history — owned by visits, not forms — so FormService
  // takes VisitInstanceRepository directly rather than duplicating that data
  // access here (matches how beneficiary.repository.ts's own note explains
  // why findVisitById duplicates VisitInstanceRepository.findById's shape
  // instead of a cross-repository dependency for one extra filter; this is
  // the opposite tradeoff — the resolver's queries are numerous/evolving
  // enough that duplicating them here would drift, so the dependency is
  // taken directly instead).
  const visitInstanceRepository = new VisitInstanceRepository(prisma);
  const service = new FormService(repository, visitInstanceRepository);
  const doc = createDocumentedRouter();
  registerFormRoutes(doc, service);
  return doc;
}
