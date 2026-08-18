import { z } from 'zod';
import { asyncHandler, ok, unauthorized } from '../app.module';
import type { OperationsService } from './operations.service';
import type { topicMarkQuerySchema } from './dto/topic-mark-query.dto';
import type { ListGatheringsQuery } from './dto/list-gatherings.dto';

/**
 * Gathering (Training session) and topic-mark request handlers. Mounted
 * under the global `api/v1` prefix by `gatherings.routes.ts`.
 */
export function createGatheringsController(service: OperationsService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(
        ok(
          await service.listGatherings(
            req.user,
            authorizationHeader,
            req.query as unknown as ListGatheringsQuery,
          ),
        ),
      );
    }),

    listTopics: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.listGatheringTopics(req.params.gatheringId, req.user)));
    }),

    getAttendance: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getGatheringAttendance(req.params.gatheringId, req.user)));
    }),

    getTrainingMarks: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getGatheringTrainingMarks(req.params.gatheringId, req.user)));
    }),

    getImages: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.getGatheringImages(req.params.gatheringId, req.user)));
    }),

    updateAttendance: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(
        ok(await service.updateGatheringAttendance(req.params.gatheringId, req.body, req.user)),
      );
    }),

    getTopicMark: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(
        ok(
          await service.getTopicMark(
            req.params.topicId,
            req.query as unknown as z.infer<typeof topicMarkQuerySchema>,
            req.user,
          ),
        ),
      );
    }),

    upsertTopicMark: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.upsertTopicMark(req.params.topicId, req.body, req.user)));
    }),

    completeTopicMark: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.completeTopicMark(req.params.topicId, req.body, req.user)));
    }),
  };
}
