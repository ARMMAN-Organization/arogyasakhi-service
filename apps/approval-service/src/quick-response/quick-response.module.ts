import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { QuickResponseRepository } from './quick-response.repository';
import { QuickResponseService } from './quick-response.service';
import { registerQuickResponseRoutes } from './quick-response.routes';
import { registerLmpChangeRequestRoutes } from '../lmp-change-requests/lmp-change-request.routes';
import { LmpChangeRequestRepository } from '../lmp-change-requests/lmp-change-request.repository';
import { LmpChangeRequestService } from '../lmp-change-requests/lmp-change-request.service';
import { LookupClient } from './lookup.client';
import { EscalationClient } from './escalation.client';
import { ReopenRequestClient } from './reopen-request.client';
import { BeneficiaryClient } from './beneficiary.client';
import { NotificationClient } from './notification.client';
import { ClosureClient } from './closure.client';
import { ReferralClient } from './referral.client';
import { IncentiveClient } from './incentive.client';
import { UserClient } from './user.client';
import { SakhiClient } from './sakhi.client';
import { GeographyClient } from './geography.client';
import { VisitClient } from './visit.client';

/**
 * Composition root for the Quick Response feature: wires repository +
 * cross-service clients → service → routes.
 */
export function createQuickResponseModule(prisma: PrismaService): DocumentedRouter {
  const repository = new QuickResponseRepository(prisma);
  const lookupClient = new LookupClient();
  const service = new QuickResponseService(
    repository,
    lookupClient,
    new EscalationClient(),
    new ReopenRequestClient(),
    new BeneficiaryClient(),
    new NotificationClient(),
    new ClosureClient(),
    new ReferralClient(),
    new IncentiveClient(),
    new UserClient(),
    new SakhiClient(),
    new GeographyClient(),
    new VisitClient(),
  );
  const lmpChangeRequestService = new LmpChangeRequestService(
    new LmpChangeRequestRepository(prisma),
    lookupClient,
    service,
  );
  const doc = createDocumentedRouter();
  registerQuickResponseRoutes(doc, service);
  registerLmpChangeRequestRoutes(doc, service, lmpChangeRequestService);
  return doc;
}
