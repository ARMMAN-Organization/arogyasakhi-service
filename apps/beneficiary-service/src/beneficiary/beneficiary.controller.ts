import { z } from 'zod';
import { asyncHandler, ok, unauthorized } from '../app.module';
import type { BeneficiaryService } from './beneficiary.service';
import {
  normalizeRegisteredDateAliases,
  type listBeneficiariesQuerySchema,
} from './dto/list-beneficiaries.dto';
import {
  normalizeRegisteredDateAliases as normalizeSummaryDateAliases,
  type summaryQuerySchema,
} from './dto/summary-query.dto';

/**
 * Beneficiary request handlers. Mounted under the global `api/v1` prefix
 * by `beneficiary.routes.ts`.
 */
export function createBeneficiaryController(service: BeneficiaryService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = normalizeRegisteredDateAliases(
        req.query as unknown as z.infer<typeof listBeneficiariesQuerySchema>,
      );
      res.json(ok(await service.list(query, req.user, authorizationHeader)));
    }),

    getRegistrationSummary: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = normalizeSummaryDateAliases(
        req.query as unknown as z.infer<typeof summaryQuerySchema>,
      );
      res.json(ok(await service.getRegistrationSummary(query, req.user, authorizationHeader)));
    }),

    getRiskSummary: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = normalizeSummaryDateAliases(
        req.query as unknown as z.infer<typeof summaryQuerySchema>,
      );
      res.json(ok(await service.getRiskSummary(query, req.user, authorizationHeader)));
    }),

    getById: asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(ok(await service.getById(req.params.id, authorizationHeader)));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const created = await service.create(req.body, req.user.id, authorizationHeader);
      res.status(201).json(ok(created));
    }),

    upsertSocioDemographics: asyncHandler(async (req, res, next) => {
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.upsertSocioDemographics(
        req.params.id,
        req.body,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),

    applyLmpChange: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.applyLmpChange(
        req.params.id,
        req.body.lmpDate,
        req.user,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),

    upsertRiskConditionSummary: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.upsertRiskConditionSummary(
        req.params.id,
        req.body,
        req.user,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),

    reactivateCase: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const updated = await service.reactivateCase(
        req.params.id,
        req.user.id,
        req.user,
        authorizationHeader,
      );
      res.json(ok(updated));
    }),
  };
}
