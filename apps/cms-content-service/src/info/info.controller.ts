import { Router } from 'express';
import { ok } from '../app.module';

/** Root info endpoint reporting service identity and liveness. */
export function createInfoRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.json(ok({ service: 'cms-content-service', status: 'running' }));
  });

  return router;
}
