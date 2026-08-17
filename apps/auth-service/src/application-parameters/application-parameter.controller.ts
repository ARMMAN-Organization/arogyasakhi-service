import { asyncHandler, ok } from '../app.module';
import type { ApplicationParameterService } from './application-parameter.service';

/**
 * Application-parameter request handlers. Mounted under the global `api/v1`
 * prefix by `application-parameter.routes.ts`.
 */
export function createApplicationParameterController(service: ApplicationParameterService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  };
}
