import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { ApprovalRequestRepository } from './approvalRequest.repository';
import { ApprovalRequestService } from './approvalRequest.service';
import { registerApprovalRequestRoutes } from './approvalRequest.routes';
import { SakhiClient } from '../quick-response/sakhi.client';
import { BeneficiaryClient } from '../quick-response/beneficiary.client';
import { NotificationClient } from '../quick-response/notification.client';

/**
 * Composition root for the approvals feature: wires repository → service →
 * routes. Replaces the former NestJS module + DI container.
 */
export function createApprovalRequestModule(prisma: PrismaService): DocumentedRouter {
  const repository = new ApprovalRequestRepository(prisma);
  const service = new ApprovalRequestService(
    repository,
    new SakhiClient(),
    new BeneficiaryClient(),
    new NotificationClient(),
  );
  const doc = createDocumentedRouter();
  registerApprovalRequestRoutes(doc, service);
  return doc;
}
