import { Router } from 'express';
import type { PrismaService } from '../prisma/prisma.service';
import { asyncHandler, ok } from '../app.module';

/** Liveness/readiness endpoints. Mounted under the global `api/v1` prefix. */
export function createHealthRouter(prisma: PrismaService): Router {
  const router = Router();

  router.get('/health/live', (_req, res) => {
    res.json(ok({ status: 'ok' }));
  });

  router.get(
    '/health/ready',
    asyncHandler(async (_req, res) => {
      await prisma.$queryRaw`SELECT 1`;
      res.json(ok({ status: 'ok' }));
    }),
  );

  return router;
}
