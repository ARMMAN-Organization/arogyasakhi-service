import { Router } from 'express';
import { ok } from '../app.module';

/** Liveness/readiness endpoints. Mounted under the global `api/v1` prefix. */
export function createHealthRouter(): Router {
  const router = Router();

  router.get('/health/live', (_req, res) => {
    res.json(ok({ status: 'ok' }));
  });

  router.get('/health/ready', (_req, res) => {
    res.json(ok({ status: 'ok' }));
  });

  return router;
}
