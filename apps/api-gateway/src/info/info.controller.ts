import { Router } from 'express';
import { ok } from '../app.module';

/** Basic service identity endpoint. */
export function createInfoRouter(): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(ok({ service: 'api-gateway', status: 'running' }));
  });
  return router;
}
