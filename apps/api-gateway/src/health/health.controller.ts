import { Router } from 'express';
import { ok } from '../app.module';

/** Liveness/readiness endpoints for the gateway itself (it owns no data). */
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
