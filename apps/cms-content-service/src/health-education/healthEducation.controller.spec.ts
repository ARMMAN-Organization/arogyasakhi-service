import type { Request, Response } from 'express';
import { createHealthEducationController } from './healthEducation.controller';
import type { HealthEducationService } from './healthEducation.service';

/**
 * Controller-level coverage for the exact regression a live test caught:
 * conditionLabel was accepted by the route schema and fully supported by
 * the repository, but the controller's req.query destructuring never
 * extracted it, so every conditionLabel-filtered call silently returned
 * every message across every condition instead of the matching one(s).
 * Only a controller-level test (not the service-level ones in
 * healthEducation.service.spec.ts) can catch this class of bug, since the
 * service itself was always correct — the query-param extraction was the
 * broken layer.
 */
describe('HealthEducation controller — listMessages', () => {
  function mockReqRes(query: Record<string, string | undefined>) {
    const req = { query } as unknown as Request;
    const json = jest.fn();
    const res = { json } as unknown as Response;
    return { req, res, json };
  }

  it('extracts conditionLabel from the query string and passes it to the service', async () => {
    const service = {
      listMessages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<HealthEducationService>;
    const controller = createHealthEducationController(service);
    const { req, res } = mockReqRes({ conditionLabel: 'Anemia' });

    await controller.listMessages(req, res, jest.fn());

    expect(service.listMessages).toHaveBeenCalledWith({
      riskConditionId: undefined,
      stage: undefined,
      conditionLabel: 'Anemia',
    });
  });

  it('extracts riskConditionId and stage alongside conditionLabel', async () => {
    const service = {
      listMessages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<HealthEducationService>;
    const controller = createHealthEducationController(service);
    const { req, res } = mockReqRes({
      riskConditionId: 'condition-1',
      stage: 'as soon as detected during ANC visit',
      conditionLabel: 'Anemia',
    });

    await controller.listMessages(req, res, jest.fn());

    expect(service.listMessages).toHaveBeenCalledWith({
      riskConditionId: 'condition-1',
      stage: 'as soon as detected during ANC visit',
      conditionLabel: 'Anemia',
    });
  });

  it('passes undefined for every filter when the query is empty', async () => {
    const service = {
      listMessages: jest.fn().mockResolvedValue([]),
    } as unknown as jest.Mocked<HealthEducationService>;
    const controller = createHealthEducationController(service);
    const { req, res } = mockReqRes({});

    await controller.listMessages(req, res, jest.fn());

    expect(service.listMessages).toHaveBeenCalledWith({
      riskConditionId: undefined,
      stage: undefined,
      conditionLabel: undefined,
    });
  });
});
