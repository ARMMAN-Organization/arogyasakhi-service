import type { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { ApprovalRequestRepository } from './approvalRequest.repository';
import { ApprovalRequestService } from './approvalRequest.service';
import { createApprovalRequestRouter } from './approvalRequest.controller';

/**
 * Composition root for the approvals feature: wires repository → service →
 * router. Replaces the former NestJS module + DI container.
 */
export function createApprovalRequestModule(prisma: PrismaService): Router {
  const repository = new ApprovalRequestRepository(prisma);
  const service = new ApprovalRequestService(repository);
  return createApprovalRequestRouter(service);
}
