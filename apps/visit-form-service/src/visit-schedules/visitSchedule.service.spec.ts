import { VisitScheduleService } from './visitSchedule.service';
import type { VisitScheduleRepository } from './visitSchedule.repository';
import * as beneficiaryClient from '../beneficiaries/beneficiary.client';
import * as ruleVersionClient from '../rules/ruleVersion.client';
import type { CreateVisitScheduleBulkInput } from './dto/create-visit-schedule-bulk.dto';

jest.mock('../beneficiaries/beneficiary.client');
jest.mock('../rules/ruleVersion.client');

describe('VisitScheduleService', () => {
  const repository = {
    findByLocalScheduleUuids: jest.fn(),
    findByBeneficiaryAndVisitCodes: jest.fn(),
    findById: jest.fn(),
    createAllOrNothing: jest.fn(),
  } as unknown as jest.Mocked<VisitScheduleRepository>;
  let service: VisitScheduleService;

  const beneficiaryId = '11111111-1111-1111-1111-111111111111';
  const ruleVersionId = '22222222-2222-2222-2222-222222222222';
  const authHeader = 'Bearer token';
  const createdByUserId = 'user-1';

  beforeEach(() => {
    jest.resetAllMocks();
    service = new VisitScheduleService(repository);
    (beneficiaryClient.beneficiaryExists as jest.Mock).mockResolvedValue(true);
    (ruleVersionClient.findRuleVersion as jest.Mock).mockResolvedValue({
      id: ruleVersionId,
      ruleSetId: 'set-1',
      status: 'PUBLISHED',
    });
    repository.findByLocalScheduleUuids.mockResolvedValue([]);
    repository.findByBeneficiaryAndVisitCodes.mockResolvedValue([]);
  });

  function baseDto(
    overrides: Partial<CreateVisitScheduleBulkInput> = {},
  ): CreateVisitScheduleBulkInput {
    return {
      beneficiaryId,
      generatedByRuleVersionId: ruleVersionId,
      generatedAt: new Date('2026-08-04T09:12:33.000Z'),
      schedules: [
        {
          localScheduleUuid: 'local-1',
          visitCode: 'ANC1',
          visitType: 'ANC',
          sequenceNo: 1,
          scheduledDate: '2026-08-04',
          windowStartDate: '2026-08-04',
          windowEndDate: '2026-08-09',
          anchorType: 'REGISTRATION',
          anchorVisitLocalUuid: null,
        },
      ],
      ...overrides,
    };
  }

  it('creates every new row and returns created/alreadyExisted counts (case 1)', async () => {
    repository.createAllOrNothing.mockResolvedValue([
      { id: 'sched-1', localScheduleUuid: 'local-1', status: 'GENERATED' },
    ] as never);

    const result = await service.createBulk(baseDto(), createdByUserId, authHeader);

    expect(result).toEqual({
      beneficiaryId,
      created: 1,
      alreadyExisted: 0,
      schedules: [{ localScheduleUuid: 'local-1', scheduleId: 'sched-1', status: 'GENERATED' }],
    });
  });

  it('returns existing rows unchanged on an identical replay, without inserting anything (case 2)', async () => {
    repository.findByLocalScheduleUuids.mockResolvedValue([
      {
        id: 'sched-1',
        localScheduleUuid: 'local-1',
        status: 'GENERATED',
        beneficiaryId,
        visitCode: 'ANC1',
        generatedByRuleVersionId: ruleVersionId,
      },
    ] as never);

    const result = await service.createBulk(baseDto(), createdByUserId, authHeader);

    expect(result.created).toBe(0);
    expect(result.alreadyExisted).toBe(1);
    expect(result.schedules).toEqual([
      { localScheduleUuid: 'local-1', scheduleId: 'sched-1', status: 'GENERATED' },
    ]);
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  it('handles a partial replay — 1 old + 1 new (case 3)', async () => {
    const dto = baseDto({
      schedules: [
        {
          localScheduleUuid: 'local-1',
          visitCode: 'ANC1',
          visitType: 'ANC',
          sequenceNo: 1,
          scheduledDate: '2026-08-04',
          windowStartDate: '2026-08-04',
          windowEndDate: '2026-08-09',
          anchorType: 'REGISTRATION',
          anchorVisitLocalUuid: null,
        },
        {
          localScheduleUuid: 'local-2',
          visitCode: 'ANC2',
          visitType: 'ANC',
          sequenceNo: 2,
          scheduledDate: '2026-08-11',
          windowStartDate: '2026-08-11',
          windowEndDate: '2026-08-16',
          anchorType: 'REGISTRATION',
          anchorVisitLocalUuid: null,
        },
      ],
    });
    repository.findByLocalScheduleUuids.mockResolvedValue([
      {
        id: 'sched-1',
        localScheduleUuid: 'local-1',
        status: 'GENERATED',
        beneficiaryId,
        visitCode: 'ANC1',
        generatedByRuleVersionId: ruleVersionId,
      },
    ] as never);
    repository.createAllOrNothing.mockResolvedValue([
      { id: 'sched-2', localScheduleUuid: 'local-2', status: 'GENERATED' },
    ] as never);

    const result = await service.createBulk(dto, createdByUserId, authHeader);

    expect(result.created).toBe(1);
    expect(result.alreadyExisted).toBe(1);
    expect(repository.createAllOrNothing).toHaveBeenCalledWith(
      [expect.objectContaining({ localScheduleUuid: 'local-2' })],
      beneficiaryId,
      ruleVersionId,
      createdByUserId,
    );
  });

  it('rejects when beneficiaryId is unknown (case 5)', async () => {
    (beneficiaryClient.beneficiaryExists as jest.Mock).mockResolvedValue(false);

    await expect(service.createBulk(baseDto(), createdByUserId, authHeader)).rejects.toMatchObject({
      status: 404,
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  it('rejects when generatedByRuleVersionId is unknown (case 6)', async () => {
    (ruleVersionClient.findRuleVersion as jest.Mock).mockResolvedValue(null);

    await expect(service.createBulk(baseDto(), createdByUserId, authHeader)).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  it('rejects when generatedByRuleVersionId exists but is not PUBLISHED', async () => {
    (ruleVersionClient.findRuleVersion as jest.Mock).mockResolvedValue({
      id: ruleVersionId,
      ruleSetId: 'set-1',
      status: 'DRAFT',
    });

    await expect(service.createBulk(baseDto(), createdByUserId, authHeader)).rejects.toMatchObject({
      status: 400,
    });
  });

  it('resolves an HR row anchored to a sibling in the same batch (case 7)', async () => {
    const dto = baseDto({
      schedules: [
        {
          localScheduleUuid: 'local-1',
          visitCode: 'ANC1',
          visitType: 'ANC',
          sequenceNo: 1,
          scheduledDate: '2026-08-04',
          windowStartDate: '2026-08-04',
          windowEndDate: '2026-08-09',
          anchorType: 'REGISTRATION',
          anchorVisitLocalUuid: null,
        },
        {
          localScheduleUuid: 'local-2',
          visitCode: 'ANC_HR1',
          visitType: 'ANC_HR',
          sequenceNo: 1,
          scheduledDate: '2026-08-05',
          windowStartDate: '2026-08-05',
          windowEndDate: '2026-08-10',
          anchorType: 'ACTUAL_VISIT',
          anchorVisitLocalUuid: 'local-1',
        },
      ],
    });
    repository.createAllOrNothing.mockResolvedValue([
      { id: 'sched-1', localScheduleUuid: 'local-1', status: 'GENERATED' },
      { id: 'sched-2', localScheduleUuid: 'local-2', status: 'GENERATED' },
    ] as never);

    await service.createBulk(dto, createdByUserId, authHeader);

    expect(repository.createAllOrNothing).toHaveBeenCalledWith(
      [
        expect.objectContaining({ localScheduleUuid: 'local-1', batchAnchorLocalUuid: null }),
        expect.objectContaining({ localScheduleUuid: 'local-2', batchAnchorLocalUuid: 'local-1' }),
      ],
      beneficiaryId,
      ruleVersionId,
      createdByUserId,
    );
  });

  it('rejects with 422 when anchorVisitLocalUuid is unresolvable, without inserting anything (case 8)', async () => {
    const dto = baseDto({
      schedules: [
        {
          localScheduleUuid: 'local-2',
          visitCode: 'ANC_HR1',
          visitType: 'ANC_HR',
          sequenceNo: 1,
          scheduledDate: '2026-08-05',
          windowStartDate: '2026-08-05',
          windowEndDate: '2026-08-10',
          anchorType: 'ACTUAL_VISIT',
          anchorVisitLocalUuid: 'missing-uuid',
        },
      ],
    });

    await expect(service.createBulk(dto, createdByUserId, authHeader)).rejects.toMatchObject({
      status: 422,
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  it('rejects with 409 when the same visitCode+ruleVersion exists under a different localScheduleUuid (case 9)', async () => {
    repository.findByBeneficiaryAndVisitCodes.mockResolvedValue([
      {
        id: 'sched-existing',
        localScheduleUuid: 'different-uuid',
        visitCode: 'ANC1',
        beneficiaryId,
        generatedByRuleVersionId: ruleVersionId,
        status: 'GENERATED',
      },
    ] as never);

    await expect(service.createBulk(baseDto(), createdByUserId, authHeader)).rejects.toMatchObject({
      status: 409,
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  it('rejects when visitCode disagrees with sequenceNo (case 20)', async () => {
    const dto = baseDto({
      schedules: [
        {
          localScheduleUuid: 'local-1',
          visitCode: 'ANC3',
          visitType: 'ANC',
          sequenceNo: 5,
          scheduledDate: '2026-08-04',
          windowStartDate: '2026-08-04',
          windowEndDate: '2026-08-09',
          anchorType: 'REGISTRATION',
          anchorVisitLocalUuid: null,
        },
      ],
    });

    await expect(service.createBulk(dto, createdByUserId, authHeader)).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });
});
