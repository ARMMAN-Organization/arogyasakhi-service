import { z } from 'zod';
import { asyncHandler, ok, unauthorized } from '../app.module';
import type { VisitInstanceService } from './visitInstance.service';
import type { visitSummaryQuerySchema } from './dto/visit-summary-query.dto';

/**
 * Visit instance request handlers. Mounted under the global `api/v1`
 * prefix by `visitInstance.routes.ts`.
 */
export function createVisitInstanceController(service: VisitInstanceService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),

    listByBeneficiary: asyncHandler(async (req, res) => {
      res.json(ok(await service.listByBeneficiaryId(req.params.beneficiaryId)));
    }),

    getVisitSummary: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof visitSummaryQuerySchema>;
      res.json(ok(await service.getVisitSummary(query, req.user, authorizationHeader)));
    }),

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),

    updateStatus: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.updateStatus(
        req.params.id,
        req.body,
        req.user,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),
  };
}
