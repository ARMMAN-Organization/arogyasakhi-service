import { asyncHandler, ok, unauthorized } from '../app.module';
import type { GeographyService } from './geography.service';
import { parseIdsParam, type byIdsQuerySchema } from './dto/by-ids-query.dto';
import type { z } from 'zod';

/**
 * Geography unit request handlers. Mounted under the global `api/v1`
 * prefix by `geography.routes.ts`.
 */
export function createGeographyController(service: GeographyService) {
  return {
    list: asyncHandler(async (req, res) => {
      res.json(ok(await service.list(req.query as { geoType?: string; parentId?: string })));
    }),

    getRoots: asyncHandler(async (_req, res) => {
      res.json(ok(await service.getRoots()));
    }),

    getById: asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
    }),

    getByIds: asyncHandler(async (req, res) => {
      const query = req.query as unknown as z.infer<typeof byIdsQuerySchema>;
      const ids = parseIdsParam(query.ids);
      res.json(ok(await service.getByIds(ids)));
    }),

    getAncestors: asyncHandler(async (req, res) => {
      res.json(ok(await service.getAncestors(req.params.id)));
    }),

    getChildren: asyncHandler(async (req, res) => {
      res.json(ok(await service.getChildren(req.params.id)));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.create(req.body, req.user.id);
      res.status(201).json(ok(created));
    }),

    update: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.update(req.params.id, req.body, req.user.id)));
    }),

    remove: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      await service.remove(req.params.id, req.user.id);
      res.json(ok({ deleted: true }));
    }),
  };
}
