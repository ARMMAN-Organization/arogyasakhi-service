import type { Request, Response } from 'express';
import type { OperationsService } from './operations.service';

/**
 * `visitSummary.controller.ts` imports from `../app.module`, which imports
 * `./config/app-config`, which calls `process.exit(1)` at module-load time if
 * `DATABASE_URL` isn't set — true in CI, unlike local dev's `.env` — so it
 * must be set before the module under test is required (matches
 * mediaAsset.controller.spec.ts's same workaround).
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';

const { createVisitSummaryController } =
  require('./visitSummary.controller') as typeof import('./visitSummary.controller');

describe('createVisitSummaryController', () => {
  function mockRes() {
    const json = jest.fn();
    return { json, res: { json } as unknown as Response };
  }

  it('rejects with unauthorized when req.user is missing', async () => {
    const service = {
      getVisitSummaryBySakhi: jest.fn(),
    } as unknown as jest.Mocked<OperationsService>;
    const controller = createVisitSummaryController(service);
    const { res } = mockRes();
    const next = jest.fn();

    await controller.getBySakhi(
      {
        user: undefined,
        header: jest.fn(),
        params: { sakhiId: 'sakhi-1' },
        query: {},
      } as unknown as Request,
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(service.getVisitSummaryBySakhi).not.toHaveBeenCalled();
  });

  it('rejects with unauthorized when the authorization header is missing', async () => {
    const service = {
      getVisitSummaryBySakhi: jest.fn(),
    } as unknown as jest.Mocked<OperationsService>;
    const controller = createVisitSummaryController(service);
    const { res } = mockRes();
    const next = jest.fn();

    await controller.getBySakhi(
      {
        user: { id: 'supervisor-1', roles: ['SUPERVISOR'] },
        header: jest.fn().mockReturnValue(undefined),
        params: { sakhiId: 'sakhi-1' },
        query: {},
      } as unknown as Request,
      res,
      next,
    );

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(service.getVisitSummaryBySakhi).not.toHaveBeenCalled();
  });

  it('calls the service with the sakhiId, query and auth header, and responds with the result', async () => {
    const summary = { total: 3, byStatus: { COMPLETED: 2, MISSED: 1 }, endingSoonVisitsCount: 1 };
    const service = {
      getVisitSummaryBySakhi: jest.fn().mockResolvedValue(summary),
    } as unknown as jest.Mocked<OperationsService>;
    const controller = createVisitSummaryController(service);
    const { json, res } = mockRes();
    const next = jest.fn();

    await controller.getBySakhi(
      {
        user: { id: 'supervisor-1', roles: ['SUPERVISOR'] },
        header: jest.fn().mockReturnValue('Bearer test-token'),
        params: { sakhiId: 'sakhi-1' },
        query: { fromDate: '2026-01-01' },
      } as unknown as Request,
      res,
      next,
    );

    expect(service.getVisitSummaryBySakhi).toHaveBeenCalledWith(
      'sakhi-1',
      { fromDate: '2026-01-01' },
      'Bearer test-token',
    );
    expect(next).not.toHaveBeenCalled();
    const [{ data }] = json.mock.calls[0];
    expect(data).toEqual(summary);
  });
});
