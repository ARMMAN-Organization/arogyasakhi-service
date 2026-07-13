import { Router } from 'express';
import { ok } from '../app.module';

/** Basic service info endpoint. Mounted under the global `api/v1` prefix. */
export function createInfoRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(ok({ service: 'reporting-etl-service', status: 'running' }));
  });

  return router;
}
