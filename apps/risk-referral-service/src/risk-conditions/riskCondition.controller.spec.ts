import { createRiskConditionController } from './riskCondition.controller';
import type { RiskConditionService } from './riskCondition.service';

function mockRes() {
  return { json: jest.fn() } as unknown as import('express').Response;
}

describe('createRiskConditionController', () => {
  const service = {
    listByConditionCodes: jest.fn(),
    listByIds: jest.fn(),
  } as unknown as jest.Mocked<RiskConditionService>;
  let controller: ReturnType<typeof createRiskConditionController>;

  beforeEach(() => {
    jest.resetAllMocks();
    controller = createRiskConditionController(service);
  });

  it('rejects a request with both ids and conditionCode as 400', async () => {
    const req = {
      query: { ids: 'rc-1', conditionCode: 'HYPERTENSION_HIGH_BP' },
    } as unknown as import('express').Request;
    const next = jest.fn();

    controller.list(req, mockRes(), next);
    await new Promise(process.nextTick);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }));
    expect(service.listByIds).not.toHaveBeenCalled();
    expect(service.listByConditionCodes).not.toHaveBeenCalled();
  });

  it('resolves by ids when only ids is given', async () => {
    service.listByIds.mockResolvedValue([]);
    const req = { query: { ids: 'rc-1,rc-2' } } as unknown as import('express').Request;
    const res = mockRes();

    controller.list(req, res, jest.fn());
    await new Promise(process.nextTick);

    expect(service.listByIds).toHaveBeenCalledWith(['rc-1', 'rc-2']);
    expect(service.listByConditionCodes).not.toHaveBeenCalled();
  });

  it('resolves by conditionCode when only conditionCode is given', async () => {
    service.listByConditionCodes.mockResolvedValue([]);
    const req = {
      query: { conditionCode: 'HYPERTENSION_HIGH_BP' },
    } as unknown as import('express').Request;
    const res = mockRes();

    controller.list(req, res, jest.fn());
    await new Promise(process.nextTick);

    expect(service.listByConditionCodes).toHaveBeenCalledWith(['HYPERTENSION_HIGH_BP']);
    expect(service.listByIds).not.toHaveBeenCalled();
  });

  it('returns every active condition when neither is given', async () => {
    service.listByConditionCodes.mockResolvedValue([]);
    const req = { query: {} } as unknown as import('express').Request;
    const res = mockRes();

    controller.list(req, res, jest.fn());
    await new Promise(process.nextTick);

    expect(service.listByConditionCodes).toHaveBeenCalledWith(undefined);
  });
});
