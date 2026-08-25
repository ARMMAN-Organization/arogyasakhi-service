import { VisitScheduleService } from './visitSchedule.service';
import type { VisitScheduleRepository } from './visitSchedule.repository';
import * as beneficiaryClient from '../beneficiaries/beneficiary.client';
import * as ruleVersionClient from '../rules/ruleVersion.client';
import * as evaluateScheduleClient from '../rules/evaluateSchedule.client';
import * as sakhiClient from '../sakhis/sakhi.client';
import type { CreateVisitScheduleBulkInput } from './dto/create-visit-schedule-bulk.dto';
import type { GenerateVisitScheduleInput } from './dto/generate-visit-schedule.dto';

jest.mock('../beneficiaries/beneficiary.client');
jest.mock('../rules/ruleVersion.client');
jest.mock('../rules/evaluateSchedule.client');
jest.mock('../sakhis/sakhi.client');
// The mutable config object is defined INSIDE the factory, not closed over
// from outer scope — jest.mock factories are hoisted above every import and
// variable declaration in this file, so referencing an outer `const`/`let`
// (or even a `var`, whose initializer still runs in source order) throws or
// reads `undefined` inside the factory. Mutable (not frozen) so individual
// tests can delete a key via jest.requireMock to exercise the "no rule set
// configured for this journey" path without jest.resetModules().
jest.mock('../config/app-config', () => ({
  appConfig: {
    ANC_SCHEDULE_RULE_SET_ID: 'anc-rule-set-1',
    PP_SCHEDULE_RULE_SET_ID: 'pp-rule-set-1',
    NN_SCHEDULE_RULE_SET_ID: 'nn-rule-set-1',
    INC_SCHEDULE_RULE_SET_ID: 'inc-rule-set-1',
    HR_SCHEDULE_RULE_SET_ID: 'hr-rule-set-1',
    DELIVERY_SCHEDULE_RULE_SET_ID: 'delivery-rule-set-1',
  },
}));

describe('VisitScheduleService', () => {
  const repository = {
    findByLocalScheduleUuids: jest.fn(),
    findByBeneficiaryAndVisitCodes: jest.fn(),
    findById: jest.fn(),
    createAllOrNothing: jest.fn(),
    updateGeneratedByRuleVersionId: jest.fn(),
  } as unknown as jest.Mocked<VisitScheduleRepository>;
  let service: VisitScheduleService;

  const beneficiaryId = '11111111-1111-1111-1111-111111111111';
  const ruleVersionId = '22222222-2222-2222-2222-222222222222';
  const sakhiId = '33333333-3333-3333-3333-333333333333';
  const authHeader = 'Bearer token';

  const sakhiCaller = { id: sakhiId, roles: ['SAKHI'] };
  const supervisorCaller = { id: 'supervisor-1', roles: ['SUPERVISOR'] };
  const otherSupervisorCaller = { id: 'other-supervisor', roles: ['SUPERVISOR'] };
  const managerCaller = { id: 'manager-1', roles: ['MANAGER'] };
  const adminCaller = { id: 'admin-1', roles: ['ADMIN'] };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new VisitScheduleService(repository);
    (beneficiaryClient.findBeneficiaryById as jest.Mock).mockResolvedValue({
      id: beneficiaryId,
      sakhiId,
    });
    (sakhiClient.findSakhiById as jest.Mock).mockResolvedValue({
      sakhiId,
      supervisorId: supervisorCaller.id,
      primaryProjectId: 'proj-1',
    });
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

    const result = await service.createBulk(baseDto(), sakhiCaller, authHeader);

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
        visitType: 'ANC',
        sequenceNo: 1,
        scheduledDate: new Date('2026-08-04'),
        windowStartDate: new Date('2026-08-04'),
        windowEndDate: new Date('2026-08-09'),
        anchorType: 'REGISTRATION',
        anchorVisitId: null,
        generatedByRuleVersionId: ruleVersionId,
      },
    ] as never);

    const result = await service.createBulk(baseDto(), sakhiCaller, authHeader);

    expect(result.created).toBe(0);
    expect(result.alreadyExisted).toBe(1);
    expect(result.schedules).toEqual([
      { localScheduleUuid: 'local-1', scheduleId: 'sched-1', status: 'GENERATED' },
    ]);
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  it('rejects with 409 when a replayed localScheduleUuid carries different content than what is stored', async () => {
    repository.findByLocalScheduleUuids.mockResolvedValue([
      {
        id: 'sched-1',
        localScheduleUuid: 'local-1',
        status: 'GENERATED',
        beneficiaryId,
        visitCode: 'ANC1',
        visitType: 'ANC',
        sequenceNo: 1,
        scheduledDate: new Date('2026-08-04'),
        windowStartDate: new Date('2026-08-04'),
        windowEndDate: new Date('2026-08-09'),
        anchorType: 'REGISTRATION',
        anchorVisitId: null,
        generatedByRuleVersionId: ruleVersionId,
      },
    ] as never);

    // Same localScheduleUuid as the stored row, but a different scheduledDate.
    const dto = baseDto({
      schedules: [
        {
          localScheduleUuid: 'local-1',
          visitCode: 'ANC1',
          visitType: 'ANC',
          sequenceNo: 1,
          scheduledDate: '2026-08-05',
          windowStartDate: '2026-08-05',
          windowEndDate: '2026-08-10',
          anchorType: 'REGISTRATION',
          anchorVisitLocalUuid: null,
        },
      ],
    });

    await expect(service.createBulk(dto, sakhiCaller, authHeader)).rejects.toMatchObject({
      status: 409,
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  it('re-stamps generatedByRuleVersionId on a matching replay under a newer rule version, without inserting anything', async () => {
    const staleRuleVersionId = 'stale-rule-version';
    repository.findByLocalScheduleUuids.mockResolvedValue([
      {
        id: 'sched-1',
        localScheduleUuid: 'local-1',
        status: 'GENERATED',
        beneficiaryId,
        visitCode: 'ANC1',
        visitType: 'ANC',
        sequenceNo: 1,
        scheduledDate: new Date('2026-08-04'),
        windowStartDate: new Date('2026-08-04'),
        windowEndDate: new Date('2026-08-09'),
        anchorType: 'REGISTRATION',
        anchorVisitId: null,
        generatedByRuleVersionId: staleRuleVersionId,
      },
    ] as never);

    const result = await service.createBulk(baseDto(), sakhiCaller, authHeader);

    expect(result.created).toBe(0);
    expect(result.alreadyExisted).toBe(1);
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
    expect(repository.updateGeneratedByRuleVersionId).toHaveBeenCalledWith(
      'sched-1',
      ruleVersionId,
    );
  });

  it('rejects with 409, and a rule-version-aware message, when a replay under a newer rule version carries different content', async () => {
    const staleRuleVersionId = 'stale-rule-version';
    repository.findByLocalScheduleUuids.mockResolvedValue([
      {
        id: 'sched-1',
        localScheduleUuid: 'local-1',
        status: 'GENERATED',
        beneficiaryId,
        visitCode: 'ANC1',
        visitType: 'ANC',
        sequenceNo: 1,
        scheduledDate: new Date('2026-08-04'),
        windowStartDate: new Date('2026-08-04'),
        windowEndDate: new Date('2026-08-09'),
        anchorType: 'REGISTRATION',
        anchorVisitId: null,
        generatedByRuleVersionId: staleRuleVersionId,
      },
    ] as never);

    // Same localScheduleUuid as the stored row, but a different scheduledDate
    // AND a different generatedByRuleVersionId than what's stored.
    const dto = baseDto({
      schedules: [
        {
          localScheduleUuid: 'local-1',
          visitCode: 'ANC1',
          visitType: 'ANC',
          sequenceNo: 1,
          scheduledDate: '2026-08-05',
          windowStartDate: '2026-08-05',
          windowEndDate: '2026-08-10',
          anchorType: 'REGISTRATION',
          anchorVisitLocalUuid: null,
        },
      ],
    });

    await expect(service.createBulk(dto, sakhiCaller, authHeader)).rejects.toMatchObject({
      status: 409,
      message: expect.stringContaining(
        'regenerating an existing schedule under a new rule version',
      ),
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
    expect(repository.updateGeneratedByRuleVersionId).not.toHaveBeenCalled();
  });

  it('rejects with 409 when a localScheduleUuid collides with another beneficiary’s row', async () => {
    // The idempotency lookup is scoped to this beneficiaryId, so a uuid
    // already used by a DIFFERENT beneficiary is invisible to it — the row
    // is treated as new, and the DB's own @unique constraint on
    // localScheduleUuid rejects the insert.
    repository.findByLocalScheduleUuids.mockResolvedValue([]);
    repository.createAllOrNothing.mockRejectedValue({ code: 'P2002' });

    await expect(service.createBulk(baseDto(), sakhiCaller, authHeader)).rejects.toMatchObject({
      status: 409,
    });
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
        visitType: 'ANC',
        sequenceNo: 1,
        scheduledDate: new Date('2026-08-04'),
        windowStartDate: new Date('2026-08-04'),
        windowEndDate: new Date('2026-08-09'),
        anchorType: 'REGISTRATION',
        anchorVisitId: null,
        generatedByRuleVersionId: ruleVersionId,
      },
    ] as never);
    repository.createAllOrNothing.mockResolvedValue([
      { id: 'sched-2', localScheduleUuid: 'local-2', status: 'GENERATED' },
    ] as never);

    const result = await service.createBulk(dto, sakhiCaller, authHeader);

    expect(result.created).toBe(1);
    expect(result.alreadyExisted).toBe(1);
    expect(repository.createAllOrNothing).toHaveBeenCalledWith(
      [expect.objectContaining({ localScheduleUuid: 'local-2' })],
      beneficiaryId,
      ruleVersionId,
      sakhiCaller.id,
    );
  });

  it('rejects when beneficiaryId is unknown (case 5)', async () => {
    (beneficiaryClient.findBeneficiaryById as jest.Mock).mockResolvedValue(null);

    await expect(service.createBulk(baseDto(), sakhiCaller, authHeader)).rejects.toMatchObject({
      status: 404,
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  it('rejects when generatedByRuleVersionId is unknown (case 6)', async () => {
    (ruleVersionClient.findRuleVersion as jest.Mock).mockResolvedValue(null);

    await expect(service.createBulk(baseDto(), sakhiCaller, authHeader)).rejects.toMatchObject({
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

    await expect(service.createBulk(baseDto(), sakhiCaller, authHeader)).rejects.toMatchObject({
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

    await service.createBulk(dto, sakhiCaller, authHeader);

    expect(repository.createAllOrNothing).toHaveBeenCalledWith(
      [
        expect.objectContaining({ localScheduleUuid: 'local-1', batchAnchorLocalUuid: null }),
        expect.objectContaining({ localScheduleUuid: 'local-2', batchAnchorLocalUuid: 'local-1' }),
      ],
      beneficiaryId,
      ruleVersionId,
      sakhiCaller.id,
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

    await expect(service.createBulk(dto, sakhiCaller, authHeader)).rejects.toMatchObject({
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

    await expect(service.createBulk(baseDto(), sakhiCaller, authHeader)).rejects.toMatchObject({
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

    await expect(service.createBulk(dto, sakhiCaller, authHeader)).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.createAllOrNothing).not.toHaveBeenCalled();
  });

  describe('ownership', () => {
    it('rejects a SAKHI uploading a schedule for a beneficiary that is not hers', async () => {
      (beneficiaryClient.findBeneficiaryById as jest.Mock).mockResolvedValue({
        id: beneficiaryId,
        sakhiId: 'some-other-sakhi',
      });

      await expect(service.createBulk(baseDto(), sakhiCaller, authHeader)).rejects.toMatchObject({
        status: 403,
      });
      expect(repository.createAllOrNothing).not.toHaveBeenCalled();
      expect(sakhiClient.findSakhiById).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR whose Sakhi is assigned to them', async () => {
      repository.createAllOrNothing.mockResolvedValue([
        { id: 'sched-1', localScheduleUuid: 'local-1', status: 'GENERATED' },
      ] as never);

      await expect(
        service.createBulk(baseDto(), supervisorCaller, authHeader),
      ).resolves.toMatchObject({ beneficiaryId });
      expect(sakhiClient.findSakhiById).toHaveBeenCalledWith(sakhiId, authHeader);
    });

    it('rejects a SUPERVISOR whose Sakhi is assigned to someone else', async () => {
      await expect(
        service.createBulk(baseDto(), otherSupervisorCaller, authHeader),
      ).rejects.toMatchObject({ status: 403 });
      expect(repository.createAllOrNothing).not.toHaveBeenCalled();
    });

    it('rejects a SUPERVISOR when the beneficiary’s Sakhi cannot be resolved', async () => {
      (sakhiClient.findSakhiById as jest.Mock).mockResolvedValue(null);

      await expect(
        service.createBulk(baseDto(), supervisorCaller, authHeader),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('allows a MANAGER regardless of assignment, without calling the Sakhi client', async () => {
      repository.createAllOrNothing.mockResolvedValue([
        { id: 'sched-1', localScheduleUuid: 'local-1', status: 'GENERATED' },
      ] as never);

      await expect(service.createBulk(baseDto(), managerCaller, authHeader)).resolves.toMatchObject(
        { beneficiaryId },
      );
      expect(sakhiClient.findSakhiById).not.toHaveBeenCalled();
    });

    it('allows an ADMIN regardless of assignment, without calling the Sakhi client', async () => {
      repository.createAllOrNothing.mockResolvedValue([
        { id: 'sched-1', localScheduleUuid: 'local-1', status: 'GENERATED' },
      ] as never);

      await expect(service.createBulk(baseDto(), adminCaller, authHeader)).resolves.toMatchObject({
        beneficiaryId,
      });
      expect(sakhiClient.findSakhiById).not.toHaveBeenCalled();
    });
  });

  describe('generateSchedule', () => {
    const ancDto: GenerateVisitScheduleInput = {
      beneficiaryId,
      scheduleKind: 'ANC',
      registrationDate: '2026-08-04',
      edd: '2027-03-01',
      deliveryFormFiledDate: null,
    };
    const ppDto: GenerateVisitScheduleInput = {
      beneficiaryId,
      scheduleKind: 'PP',
      deliveryDate: '2026-08-04',
    };
    const nnDto: GenerateVisitScheduleInput = {
      beneficiaryId,
      scheduleKind: 'NN',
      deliveryDate: '2026-08-04',
      deliveryFormFiledDate: '2026-08-05',
    };
    const incDto: GenerateVisitScheduleInput = {
      beneficiaryId,
      scheduleKind: 'INC',
      dob: '2026-08-04',
      registrationDate: '2026-08-05',
    };
    const hrDto: GenerateVisitScheduleInput = {
      beneficiaryId,
      scheduleKind: 'HR',
      phase: 'ANC',
      hrDetectedThisVisit: true,
      actualCompletionDate: '2026-08-04',
    };
    const deliveryDto: GenerateVisitScheduleInput = {
      beneficiaryId,
      scheduleKind: 'DELIVERY',
      deliveryOutcome: 'LIVE_BIRTH',
      motherEnrollmentType: 'ANC_ENROLLED',
      numberOfChildren: 1,
      deliveryDate: '2026-08-04',
      deliveryFormFiledDate: '2026-08-05',
    };

    it('computes ANC rows via rules-service and persists them, forwarding exactly the ANC-shaped input', async () => {
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockResolvedValue({
        ruleVersionId,
        totalRegularVisits: 2,
        visits: [
          {
            visitName: 'ANC1',
            scheduledDate: '2026-08-04',
            windowOpen: '2026-08-04',
            windowClose: '2026-08-09',
          },
          {
            visitName: 'ANC2',
            scheduledDate: '2026-09-03',
            windowOpen: '2026-08-29',
            windowClose: '2026-09-08',
          },
        ],
        postEddVisit: null,
        deliveryFormFiledByEddPlus7: false,
      });
      repository.createAllOrNothing.mockResolvedValue([
        {
          id: 'sched-1',
          localScheduleUuid: `generated-${beneficiaryId}-ANC1`,
          status: 'GENERATED',
        },
        {
          id: 'sched-2',
          localScheduleUuid: `generated-${beneficiaryId}-ANC2`,
          status: 'GENERATED',
        },
      ] as never);

      const result = await service.generateSchedule(ancDto, sakhiCaller, authHeader);

      expect(evaluateScheduleClient.evaluateSchedule).toHaveBeenCalledWith(
        'anc-rule-set-1',
        'ANC',
        { registrationDate: '2026-08-04', edd: '2027-03-01', deliveryFormFiledDate: null },
        authHeader,
      );
      expect(result.created).toBe(2);
      expect(result.evaluation.totalRegularVisits).toBe(2);
      expect(repository.createAllOrNothing).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ visitCode: 'ANC1', sequenceNo: 1 }),
          expect.objectContaining({ visitCode: 'ANC2', sequenceNo: 2 }),
        ]),
        beneficiaryId,
        ruleVersionId,
        sakhiCaller.id,
      );
    });

    it('rejects with 400 when no rule set is configured for the requested schedule kind', async () => {
      const { appConfig } = jest.requireMock('../config/app-config') as {
        appConfig: Record<string, string | undefined>;
      };
      const original = appConfig.INC_SCHEDULE_RULE_SET_ID;
      delete appConfig.INC_SCHEDULE_RULE_SET_ID;
      try {
        await expect(
          service.generateSchedule(incDto, sakhiCaller, authHeader),
        ).rejects.toMatchObject({ status: 400 });
        expect(evaluateScheduleClient.evaluateSchedule).not.toHaveBeenCalled();
      } finally {
        appConfig.INC_SCHEDULE_RULE_SET_ID = original;
      }
    });

    it('propagates a 502 when rules-service is unreachable', async () => {
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockRejectedValue({ status: 502 });

      await expect(service.generateSchedule(ancDto, sakhiCaller, authHeader)).rejects.toMatchObject(
        { status: 502 },
      );
      expect(repository.createAllOrNothing).not.toHaveBeenCalled();
    });

    it('persists exactly 5 PP rows, forwarding only deliveryDate as input', async () => {
      const visits = Array.from({ length: 5 }, (_, i) => ({
        visitName: `PP${i + 1}`,
        scheduledDate: '2026-08-04',
        windowOpen: '2026-08-01',
        windowClose: '2026-08-09',
      }));
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockResolvedValue({
        ruleVersionId,
        visits,
      });
      repository.createAllOrNothing.mockResolvedValue(
        visits.map((_v, i) => ({
          id: `sched-${i}`,
          localScheduleUuid: `generated-${beneficiaryId}-PP${i + 1}`,
          status: 'GENERATED',
        })) as never,
      );

      const result = await service.generateSchedule(ppDto, sakhiCaller, authHeader);

      expect(evaluateScheduleClient.evaluateSchedule).toHaveBeenCalledWith(
        'pp-rule-set-1',
        'PP',
        { deliveryDate: '2026-08-04' },
        authHeader,
      );
      expect(result.created).toBe(5);
    });

    it('rejects PP when rules-service does not return exactly 5 visits', async () => {
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockResolvedValue({
        ruleVersionId,
        visits: [
          {
            visitName: 'PP1',
            scheduledDate: '2026-08-04',
            windowOpen: '2026-08-01',
            windowClose: '2026-08-09',
          },
        ],
      });

      await expect(service.generateSchedule(ppDto, sakhiCaller, authHeader)).rejects.toMatchObject({
        status: 400,
      });
      expect(repository.createAllOrNothing).not.toHaveBeenCalled();
    });

    it('persists only the present NN slot when nn2 is absent, forwarding deliveryDate/deliveryFormFiledDate as input', async () => {
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockResolvedValue({
        ruleVersionId,
        scenario: 'SINGLE_VISIT',
        neonatalPhaseApplies: true,
        nn1: {
          visitName: 'NN1',
          scheduledDate: '2026-08-04',
          windowOpen: '2026-08-01',
          windowClose: '2026-08-09',
        },
        nn2: null,
      });
      repository.createAllOrNothing.mockResolvedValue([
        { id: 'sched-1', localScheduleUuid: `generated-${beneficiaryId}-NN1`, status: 'GENERATED' },
      ] as never);

      const result = await service.generateSchedule(nnDto, sakhiCaller, authHeader);

      expect(evaluateScheduleClient.evaluateSchedule).toHaveBeenCalledWith(
        'nn-rule-set-1',
        'NN',
        { deliveryDate: '2026-08-04', deliveryFormFiledDate: '2026-08-05' },
        authHeader,
      );
      expect(result.created).toBe(1);
      expect(repository.createAllOrNothing).toHaveBeenCalledWith(
        [expect.objectContaining({ visitCode: 'NN1' })],
        beneficiaryId,
        ruleVersionId,
        sakhiCaller.id,
      );
    });

    it('persists INC rows and ignores droppedVisits, forwarding dob/registrationDate as input', async () => {
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockResolvedValue({
        ruleVersionId,
        registrationCategory: 'EARLY',
        visits: [
          {
            visitName: 'INC1',
            scheduledDate: '2026-09-04',
            windowOpen: '2026-09-01',
            windowClose: '2026-09-09',
          },
        ],
        droppedVisits: ['INC0'],
      });
      repository.createAllOrNothing.mockResolvedValue([
        {
          id: 'sched-1',
          localScheduleUuid: `generated-${beneficiaryId}-INC1`,
          status: 'GENERATED',
        },
      ] as never);

      const result = await service.generateSchedule(incDto, sakhiCaller, authHeader);

      expect(evaluateScheduleClient.evaluateSchedule).toHaveBeenCalledWith(
        'inc-rule-set-1',
        'INC',
        { dob: '2026-08-04', registrationDate: '2026-08-05' },
        authHeader,
      );
      expect(result.created).toBe(1);
      expect(repository.createAllOrNothing).toHaveBeenCalledWith(
        [expect.objectContaining({ visitCode: 'INC1' })],
        beneficiaryId,
        ruleVersionId,
        sakhiCaller.id,
      );
    });

    it('persists no rows when HR evaluation says generateHrVisit is false, forwarding phase/hrDetectedThisVisit/actualCompletionDate', async () => {
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockResolvedValue({
        ruleVersionId,
        generateHrVisit: false,
        cumulative: false,
        hrVisit: null,
      });

      const result = await service.generateSchedule(hrDto, sakhiCaller, authHeader);

      expect(evaluateScheduleClient.evaluateSchedule).toHaveBeenCalledWith(
        'hr-rule-set-1',
        'HR',
        { phase: 'ANC', hrDetectedThisVisit: true, actualCompletionDate: '2026-08-04' },
        authHeader,
      );
      expect(result.created).toBe(0);
      expect(repository.createAllOrNothing).not.toHaveBeenCalled();
    });

    it('returns the DELIVERY dispatch decision with no persisted rows, forwarding deliveryOutcome/motherEnrollmentType/numberOfChildren/dates', async () => {
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockResolvedValue({
        ruleVersionId,
        motherPlan: {
          generatePpSchedule: true,
          ppScheduleStartsFrom: 'PP1',
          lapseOpenAncVisits: true,
        },
        childPlans: [{ childIndex: 0, generateNnSchedule: true, generateIncSchedule: true }],
        neonatalPhaseAppliesGlobally: true,
      });

      const result = await service.generateSchedule(deliveryDto, sakhiCaller, authHeader);

      expect(evaluateScheduleClient.evaluateSchedule).toHaveBeenCalledWith(
        'delivery-rule-set-1',
        'DELIVERY',
        {
          deliveryOutcome: 'LIVE_BIRTH',
          motherEnrollmentType: 'ANC_ENROLLED',
          numberOfChildren: 1,
          deliveryDate: '2026-08-04',
          deliveryFormFiledDate: '2026-08-05',
        },
        authHeader,
      );
      expect(result.created).toBe(0);
      expect(result.evaluation.motherPlan).toMatchObject({ generatePpSchedule: true });
      expect(repository.createAllOrNothing).not.toHaveBeenCalled();
    });

    it("rejects a SUPERVISOR whose Sakhi isn't theirs, same ownership rule as createBulk", async () => {
      await expect(
        service.generateSchedule(ancDto, otherSupervisorCaller, authHeader),
      ).rejects.toMatchObject({ status: 403 });
      expect(evaluateScheduleClient.evaluateSchedule).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR whose Sakhi is assigned to them, same ownership rule as createBulk', async () => {
      (evaluateScheduleClient.evaluateSchedule as jest.Mock).mockResolvedValue({
        ruleVersionId,
        totalRegularVisits: 0,
        visits: [],
        postEddVisit: null,
        deliveryFormFiledByEddPlus7: false,
      });

      await expect(
        service.generateSchedule(ancDto, supervisorCaller, authHeader),
      ).resolves.toMatchObject({ beneficiaryId, created: 0 });
      expect(sakhiClient.findSakhiById).toHaveBeenCalledWith(sakhiId, authHeader);
    });
  });
});
