import { asyncHandler, ok, unauthorized } from '../app.module';
import type { ProjectService } from './project.service';

/**
 * Project/funder request handlers. Mounted under the global `api/v1`
 * prefix by `project.routes.ts`.
 */
export function createProjectController(service: ProjectService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.list(req.user)));
    }),

    getById: asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
    }),

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),

    update: asyncHandler(async (req, res) => {
      res.json(ok(await service.update(req.params.id, req.body)));
    }),

    listFunders: asyncHandler(async (_req, res) => {
      res.json(ok(await service.listFunders()));
    }),

    createFunder: asyncHandler(async (req, res) => {
      const created = await service.createFunder(req.body);
      res.status(201).json(ok(created));
    }),
  };
}
