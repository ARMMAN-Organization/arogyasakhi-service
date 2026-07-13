import { Router } from 'express';
import type { ApprovalRequestService } from './approvalRequest.service';
import { createApprovalRequestSchema } from './dto/create-approvalRequest.dto';
import { asyncHandler, ok, validateBody } from '../app.module';

/** Approval request HTTP routes. Mounted under the global `api/v1` prefix. */
export function createApprovalRequestRouter(service: ApprovalRequestService): Router {
  const router = Router();

  router.get(
    '/approvals',
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  router.post(
    '/approvals',
    validateBody(createApprovalRequestSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return router;
}
