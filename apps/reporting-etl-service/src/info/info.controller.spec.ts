import type { Request, Response } from 'express';

/**
 * reporting-etl-service ships schema-only in this PR (etl_runs/report_exports
 * have no API layer yet — see prisma/schema.prisma header), so there is no
 * domain service/repository to unit test. This smoke test exercises the one
 * route the service does expose, so `nx test reporting-etl-service` has at
 * least one real assertion instead of failing with "No tests found."
 *
 * `info.controller.ts` imports from `../app.module`, which imports
 * `./config/app-config`, which calls `process.exit(1)` at module-load time if
 * `DATABASE_URL` isn't a valid URL — so it must be set before the module
 * under test is required.
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';

const { createInfoRouter } = require('./info.controller') as typeof import('./info.controller');

describe('createInfoRouter', () => {
  it('responds on GET / with the service name and running status', () => {
    const router = createInfoRouter();
    const layer = router.stack.find((l) => l.route?.path === '/');
    expect(layer).toBeDefined();
    if (!layer?.route) throw new Error('expected a route registered at "/"');

    const handler = layer.route.stack[0].handle as (req: Request, res: Response) => void;
    const json = jest.fn();
    const res = { json } as unknown as Response;

    handler({} as Request, res);

    expect(json).toHaveBeenCalledWith({
      success: true,
      message: 'OK',
      data: { service: 'reporting-etl-service', status: 'running' },
    });
  });
});
