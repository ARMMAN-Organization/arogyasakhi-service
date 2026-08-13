import { asyncHandler, ok } from '../app.module';
import type { ApprovalRequestService } from './approvalRequest.service';

/**
 * Approval request handlers. Mounted under the global `api/v1` prefix by
 * `approvalRequest.routes.ts`.
 */
export function createApprovalRequestController(service: ApprovalRequestService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  };
}
