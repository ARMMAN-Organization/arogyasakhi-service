import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { QuickResponseRepository } from './quick-response.repository';
import { QuickResponseService } from './quick-response.service';
import { createQuickResponseRouter } from './quick-response.controller';
import { LookupClient } from './lookup.client';
import { EscalationClient } from './escalation.client';
import { ReopenRequestClient } from './reopen-request.client';

/**
 * Composition root for the Quick Response feature: wires repository +
 * cross-service clients → service → router.
 */
export function createQuickResponseModule(prisma: PrismaService): DocumentedRouter {
  const repository = new QuickResponseRepository(prisma);
  const service = new QuickResponseService(
    repository,
    new LookupClient(),
    new EscalationClient(),
    new ReopenRequestClient(),
  );
  return createQuickResponseRouter(service);
}
