import { asyncHandler, ok, unauthorized } from '../app.module';
import type { RiskAssessmentService } from './riskAssessment.service';

/**
 * Risk assessment request handlers. Mounted under the global `api/v1`
 * prefix by `riskAssessment.routes.ts`.
 */
export function createRiskAssessmentController(service: RiskAssessmentService) {
  return {
    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.create(req.body, req.user, authorizationHeader);
      res.status(201).json(ok(created));
    }),

    listByVisitIds: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { beneficiaryId, visitIds } = req.query as { beneficiaryId: string; visitIds: string };
      const found = await service.listByVisitIds(
        beneficiaryId,
        visitIds.split(','),
        req.user,
        authorizationHeader,
      );
      res.json(ok(found));
    }),
  };
}
