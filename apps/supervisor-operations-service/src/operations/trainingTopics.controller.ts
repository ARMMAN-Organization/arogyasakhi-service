import { asyncHandler, ok, unauthorized } from '../app.module';
import type { OperationsService } from './operations.service';

/**
 * Training topic request handlers. Mounted under the global `api/v1`
 * prefix by `trainingTopics.routes.ts`.
 */
export function createTrainingTopicsController(service: OperationsService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.listTrainingTopics()));
    }),

    create: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const created = await service.createTrainingTopic(req.body, req.user.id);
      res.status(201).json(ok(created));
    }),
  };
}
