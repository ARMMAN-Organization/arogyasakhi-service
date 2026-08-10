import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { ApprovalRequestRepository } from './approvalRequest.repository';
import { ApprovalRequestService } from './approvalRequest.service';
import { registerApprovalRequestRoutes } from './approvalRequest.routes';

/**
 * Composition root for the approvals feature: wires repository → service →
 * routes. Replaces the former NestJS module + DI container.
 */
export function createApprovalRequestModule(prisma: PrismaService): DocumentedRouter {
  const repository = new ApprovalRequestRepository(prisma);
  const service = new ApprovalRequestService(repository);
  const doc = createDocumentedRouter();
  registerApprovalRequestRoutes(doc, service);
  return doc;
}
