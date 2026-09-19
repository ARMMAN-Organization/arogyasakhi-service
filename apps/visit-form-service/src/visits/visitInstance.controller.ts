import { z } from 'zod';
import { asyncHandler, ok, unauthorized } from '../app.module';
import type { VisitInstanceService } from './visitInstance.service';
import type { visitSummaryQuerySchema } from './dto/visit-summary-query.dto';
import type { visitSummaryByTypeQuerySchema } from './dto/visit-summary-by-type-query.dto';
import type { countByBeneficiarySchema } from './dto/count-by-beneficiary.dto';
import type { byPadaSchema } from './dto/by-pada.dto';
import type { visitHistoryQuerySchema } from './dto/visit-history-query.dto';
import type { RestoreForSakhiInput } from './dto/restore-for-sakhi.dto';
import type { listVisitsQuerySchema } from './dto/list-visits.dto';

/**
 * Visit instance request handlers. Mounted under the global `api/v1`
 * prefix by `visitInstance.routes.ts`.
 */
export function createVisitInstanceController(service: VisitInstanceService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof listVisitsQuerySchema>;
      res.json(ok(await service.list(query, req.user, authorizationHeader)));
    }),

    listByBeneficiary: asyncHandler(async (req, res) => {
      res.json(ok(await service.listByBeneficiaryId(req.params.beneficiaryId)));
    }),

    getBeneficiaryMisSummary: asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(
        ok(await service.getBeneficiaryMisSummary(req.params.beneficiaryId, authorizationHeader)),
      );
    }),

    getById: asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
    }),

    getMisSummary: asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(ok(await service.getMisSummary(req.params.id, authorizationHeader)));
    }),

    getVisitSummary: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof visitSummaryQuerySchema>;
      res.json(ok(await service.getVisitSummary(query, req.user, authorizationHeader)));
    }),

    getVisitSummaryByType: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof visitSummaryByTypeQuerySchema>;
      res.json(ok(await service.getVisitSummaryByType(query, req.user, authorizationHeader)));
    }),

    getCountByBeneficiary: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { beneficiaryIds } = req.body as z.infer<typeof countByBeneficiarySchema>;
      res.json(
        ok(await service.getCountByBeneficiary(beneficiaryIds, req.user, authorizationHeader)),
      );
    }),

    getByPada: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { beneficiaryIds, date } = req.body as z.infer<typeof byPadaSchema>;
      res.json(ok(await service.getByPada(beneficiaryIds, date, req.user, authorizationHeader)));
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

    getVisitHistory: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof visitHistoryQuerySchema>;
      res.json(
        ok(
          await service.getVisitHistory(
            req.params.beneficiaryId,
            query,
            req.user,
            authorizationHeader,
          ),
        ),
      );
    }),

    restoreForSakhi: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const { sakhiUserId } = req.body as RestoreForSakhiInput;
      const result = await service.restoreForSakhi(sakhiUserId, req.user, authorizationHeader);
      res.json(ok(result));
    }),
  };
}
