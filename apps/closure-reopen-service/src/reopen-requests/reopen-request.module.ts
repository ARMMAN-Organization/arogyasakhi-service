import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { ReopenRequestRepository } from './reopen-request.repository';
import { ReopenRequestService } from './reopen-request.service';
import { registerReopenRequestRoutes } from './reopen-request.routes';
import { AuditClient } from './audit.client';
import { NotificationClient } from './notification.client';
import { ApprovalClient } from './approval.client';
import { LookupClient } from './lookup.client';
import { BeneficiaryClient } from './beneficiary.client';

/**
 * Composition root for the reopen-requests feature: wires repository → service → routes.
 */
export function createReopenRequestModule(prisma: PrismaService): DocumentedRouter {
  const repository = new ReopenRequestRepository(prisma);
  const auditClient = new AuditClient();
  const notificationClient = new NotificationClient();
  const approvalClient = new ApprovalClient();
  const lookupClient = new LookupClient();
  const beneficiaryClient = new BeneficiaryClient();
  const service = new ReopenRequestService(
    repository,
    auditClient,
    notificationClient,
    approvalClient,
    lookupClient,
    beneficiaryClient,
  );
  const doc = createDocumentedRouter();
  registerReopenRequestRoutes(doc, service);
  return doc;
}
