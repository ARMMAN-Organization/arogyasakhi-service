import { asyncHandler, ok } from '../app.module';
import type { LookupService } from './lookup.service';

/**
 * Lookup category/value request handlers. Mounted under the global `api/v1`
 * prefix by `lookup.routes.ts`.
 */
export function createLookupController(service: LookupService) {
  return {
    listAll: asyncHandler(async (_req, res) => {
      res.json(ok(await service.listAll()));
    }),

    getByCategoryCode: asyncHandler(async (req, res) => {
      res.json(ok(await service.getByCategoryCode(req.params.categoryCode)));
    }),

    createValue: asyncHandler(async (req, res) => {
      const created = await service.createValue(req.params.categoryCode, req.body);
      res.status(201).json(ok(created));
    }),

    updateValue: asyncHandler(async (req, res) => {
      res.json(ok(await service.updateValue(req.params.id, req.body)));
    }),

    bulkUpsertValues: asyncHandler(async (req, res) => {
      res.json(ok(await service.bulkUpsertValues(req.params.categoryCode, req.body)));
    }),
  };
}
