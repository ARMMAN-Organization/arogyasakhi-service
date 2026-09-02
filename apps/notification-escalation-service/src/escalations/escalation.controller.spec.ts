/**
 * escalation.controller.ts imports from ../app.module, which imports
 * ./config/app-config, which calls process.exit(1) at module-load time if
 * DATABASE_URL isn't a valid URL — so it must be set before the module
 * under test is required (see reporting-etl-service's info.controller.spec.ts
 * and risk-referral-service's riskCondition.controller.spec.ts for the same
 * workaround).
 */
process.env.DATABASE_URL ??= 'postgresql://user:pass@localhost:5432/test';

import { createEscalationController } from './escalation.controller';
import type { EscalationService } from './escalation.service';

function mockRes() {
  return {
    json: jest.fn(),
    status: jest.fn().mockReturnThis(),
  } as unknown as import('express').Response;
}

describe('createEscalationController — findByIds', () => {
  const service = {
    findManyByIds: jest.fn(),
  } as unknown as jest.Mocked<EscalationService>;
  let controller: ReturnType<typeof createEscalationController>;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = createEscalationController(service);
  });

  it('rejects a request with no Authorization header as 401', async () => {
    const req = {
      header: () => undefined,
      query: { ids: '11111111-1111-1111-1111-111111111111' },
    } as unknown as import('express').Request;
    const next = jest.fn();

    controller.findByIds(req, mockRes(), next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 401 }));
    expect(service.findManyByIds).not.toHaveBeenCalled();
  });

  it('splits and trims the comma-separated ids before calling the service', async () => {
    service.findManyByIds.mockResolvedValue([]);
    const req = {
      header: () => 'Bearer test-token',
      query: { ids: '11111111-1111-1111-1111-111111111111, 22222222-2222-2222-2222-222222222222' },
    } as unknown as import('express').Request;
    const res = mockRes();

    controller.findByIds(req, res, jest.fn());
    await new Promise(process.nextTick);

    expect(service.findManyByIds).toHaveBeenCalledWith(
      ['11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'],
      'Bearer test-token',
    );
  });

  it('responds with the service result wrapped in the standard envelope', async () => {
    const cards = [{ cardId: '11111111-1111-1111-1111-111111111111', cardType: 'EDD_NEARING' }];
    service.findManyByIds.mockResolvedValue(cards as never);
    const req = {
      header: () => 'Bearer test-token',
      query: { ids: '11111111-1111-1111-1111-111111111111' },
    } as unknown as import('express').Request;
    const res = mockRes();

    controller.findByIds(req, res, jest.fn());
    await new Promise(process.nextTick);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, data: cards }));
  });
});
