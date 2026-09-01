import { asyncHandler, ok, unauthorized } from '../app.module';
import type { QuickResponseService } from './quick-response.service';
import type { listQuickResponseSchema } from './dto/list-quick-response.dto';
import type { z } from 'zod';

/**
 * Quick Response request handlers. Mounted under the global `api/v1`
 * prefix by `quick-response.routes.ts`.
 */
export function createQuickResponseController(service: QuickResponseService) {
  return {
    list: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const query = req.query as unknown as z.infer<typeof listQuickResponseSchema>;
      res.json(ok(await service.list(query, req.user, authorizationHeader)));
    }),

    getCardDetail: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(ok(await service.getCardDetail(req.params.cardId, req.user, authorizationHeader)));
    }),

    decide: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      const result = await service.decide(
        req.params.cardId,
        req.body,
        req.user.id,
        authorizationHeader,
      );
      res.json(ok(result));
    }),
  };
}
