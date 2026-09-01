import { asyncHandler, ok, unauthorized } from '../app.module';
import type { ApprovalRequestService } from './approvalRequest.service';
import type { GetApprovalBySourceInput } from './dto/get-approval-by-source.dto';

/**
 * Approval request handlers. Mounted under the global `api/v1` prefix by
 * `approvalRequest.routes.ts`.
 */
export function createApprovalRequestController(service: ApprovalRequestService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    getBySource: asyncHandler(async (req, res) => {
      const query = req.query as unknown as GetApprovalBySourceInput;
      const row = query.closureId
        ? await service.findByClosureId(query.closureId)
        : await service.findByReopenRequestId(query.reopenRequestId as string);
      res.json(ok(row));
    }),

    create: asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.create(req.body, authorizationHeader);
      res.status(201).json(ok(created));
    }),
  };
}
