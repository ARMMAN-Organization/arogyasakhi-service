import { asyncHandler, ok, unauthorized } from '../app.module';
import type { SakhiService } from './sakhi.service';
import { parseIdsParam } from './dto/by-ids-query.dto';
import type { CreateLocationAssignmentInput } from './dto/create-location-assignment.dto';
import type { UpdateLocationAssignmentInput } from './dto/update-location-assignment.dto';
import type { EndLocationAssignmentInput } from './dto/end-location-assignment.dto';

/**
 * Sakhi profile request handlers. Mounted under the global `api/v1` prefix
 * by `sakhi.routes.ts`.
 */
export function createSakhiController(service: SakhiService) {
  return {
    listByProject: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.listByProject(req.params.projectId, req.user)));
    }),

    getById: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getById(req.params.sakhiId, req.user)));
    }),

    getManyByIds: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const ids = parseIdsParam(req.query.ids as string);
      res.json(ok(await service.getManyByIds(ids, req.user)));
    }),

    getActiveLocationAssignments: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { asOf } = req.query as unknown as { asOf?: Date };
      res.json(
        ok(
          await service.getActiveLocationAssignments(
            req.params.sakhiId,
            req.user,
            asOf ?? new Date(),
          ),
        ),
      );
    }),

    createLocationAssignment: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const input = req.body as CreateLocationAssignmentInput;
      const created = await service.createLocationAssignment(req.params.sakhiId, input, req.user);
      res.status(201).json(ok(created));
    }),

    updateLocationAssignment: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const input = req.body as UpdateLocationAssignmentInput;
      const updated = await service.updateLocationAssignment(
        req.params.sakhiId,
        req.params.assignmentId,
        input,
        req.user,
      );
      res.json(ok(updated));
    }),

    endLocationAssignment: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const { effectiveTo } = req.body as EndLocationAssignmentInput;
      const ended = await service.endLocationAssignment(
        req.params.sakhiId,
        req.params.assignmentId,
        effectiveTo,
        req.user,
      );
      res.json(ok(ended));
    }),
  };
}
