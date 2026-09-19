import { VisitInstanceRepository } from './visitInstance.repository';

describe('VisitInstanceRepository', () => {
  const count = jest.fn();
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const groupBy = jest.fn();
  const visitInstanceUpdateMany = jest.fn();
  const visitScheduleUpdateMany = jest.fn();
  const visitStatusHistoryUpdateMany = jest.fn();
  const formSubmissionFindMany = jest.fn();
  const formSubmissionUpdateMany = jest.fn();
  const formAnswerUpdateMany = jest.fn();
  const $transaction = jest.fn((ops: unknown[]) => Promise.all(ops));
  const prisma = {
    visitInstance: { count, findMany, findFirst, groupBy, updateMany: visitInstanceUpdateMany },
    visitSchedule: { updateMany: visitScheduleUpdateMany },
    visitStatusHistory: { updateMany: visitStatusHistoryUpdateMany },
    formSubmission: { findMany: formSubmissionFindMany, updateMany: formSubmissionUpdateMany },
    formAnswer: { updateMany: formAnswerUpdateMany },
    $transaction,
  } as never;
  let repository: VisitInstanceRepository;

  const PENDING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const MISSED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const TODAY = new Date('2026-08-17T00:00:00.000Z');
  const END_BOUNDARY = new Date('2026-08-20T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
    $transaction.mockImplementation((ops: unknown[]) => Promise.all(ops));
    repository = new VisitInstanceRepository(prisma);
  });

  describe('countEndingSoon', () => {
    it('counts visits restricted to the given status lookup ids within the window boundary', async () => {
      count.mockResolvedValue(2);

      const result = await repository.countEndingSoon({
        dueOrOverdueStatusLookupValueIds: [PENDING_ID, MISSED_ID],
        today: TODAY,
        endBoundary: END_BOUNDARY,
      });

      expect(count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          statusLookupValueId: { in: [PENDING_ID, MISSED_ID] },
          schedule: { windowEndDate: { gte: TODAY, lte: END_BOUNDARY } },
        },
      });
      expect(result).toBe(2);
    });

    it('returns 0 without querying when dueOrOverdueStatusLookupValueIds is empty', async () => {
      const result = await repository.countEndingSoon({
        dueOrOverdueStatusLookupValueIds: [],
        today: TODAY,
        endBoundary: END_BOUNDARY,
      });

      expect(count).not.toHaveBeenCalled();
      expect(result).toBe(0);
    });

    it('applies sakhiId/sakhiIds/date-range filters identically to countByStatus', async () => {
      count.mockResolvedValue(0);

      await repository.countEndingSoon({
        sakhiIds: ['sakhi-a', 'sakhi-b'],
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
        dueOrOverdueStatusLookupValueIds: [PENDING_ID],
        today: TODAY,
        endBoundary: END_BOUNDARY,
      });

      expect(count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          statusLookupValueId: { in: [PENDING_ID] },
          sakhiId: { in: ['sakhi-a', 'sakhi-b'] },
          schedule: {
            windowEndDate: { gte: TODAY, lte: END_BOUNDARY },
            scheduledDate: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lte: new Date('2026-08-31T23:59:59.999Z'),
            },
          },
        },
      });
    });
  });

  describe('countByCaseType', () => {
    it('returns each in-scope visit’s schedule.visitType', async () => {
      findMany.mockResolvedValue([
        { schedule: { visitType: 'ANC' } },
        { schedule: { visitType: 'NN' } },
        { schedule: { visitType: 'NN' } },
      ]);

      const result = await repository.countByCaseType({});

      expect(findMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
        select: { schedule: { select: { visitType: true } } },
      });
      expect(result).toEqual(['ANC', 'NN', 'NN']);
    });

    it('applies the sakhiId filter', async () => {
      findMany.mockResolvedValue([]);

      await repository.countByCaseType({ sakhiId: 'sakhi-1' });

      expect(findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, sakhiId: 'sakhi-1' },
        select: { schedule: { select: { visitType: true } } },
      });
    });

    it('applies the sakhiIds filter', async () => {
      findMany.mockResolvedValue([]);

      await repository.countByCaseType({ sakhiIds: ['sakhi-a', 'sakhi-b'] });

      expect(findMany).toHaveBeenCalledWith({
        where: { isDeleted: false, sakhiId: { in: ['sakhi-a', 'sakhi-b'] } },
        select: { schedule: { select: { visitType: true } } },
      });
    });

    it('applies the fromDate/toDate range on schedule.scheduledDate', async () => {
      findMany.mockResolvedValue([]);

      await repository.countByCaseType({ fromDate: '2026-08-01', toDate: '2026-08-31' });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          schedule: {
            scheduledDate: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lte: new Date('2026-08-31T23:59:59.999Z'),
            },
          },
        },
        select: { schedule: { select: { visitType: true } } },
      });
    });

    it('returns an empty array when no visits match', async () => {
      findMany.mockResolvedValue([]);

      const result = await repository.countByCaseType({ sakhiId: 'sakhi-1' });

      expect(result).toEqual([]);
    });
  });

  describe('countByStatusAndCaseType', () => {
    it('returns each in-scope visit’s statusLookupValueId + schedule.visitType pair', async () => {
      findMany.mockResolvedValue([
        { statusLookupValueId: 'status-1', schedule: { visitType: 'ANC' } },
        { statusLookupValueId: 'status-2', schedule: { visitType: 'NN' } },
      ]);

      const result = await repository.countByStatusAndCaseType({});

      expect(findMany).toHaveBeenCalledWith({
        where: { isDeleted: false },
        select: { statusLookupValueId: true, schedule: { select: { visitType: true } } },
      });
      expect(result).toEqual([
        { statusLookupValueId: 'status-1', schedule: { visitType: 'ANC' } },
        { statusLookupValueId: 'status-2', schedule: { visitType: 'NN' } },
      ]);
    });

    it('applies the sakhiId/sakhiIds/date-range filters identically to countByStatus/countByCaseType', async () => {
      findMany.mockResolvedValue([]);

      await repository.countByStatusAndCaseType({
        sakhiIds: ['sakhi-a', 'sakhi-b'],
        fromDate: '2026-08-01',
        toDate: '2026-08-31',
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          sakhiId: { in: ['sakhi-a', 'sakhi-b'] },
          schedule: {
            scheduledDate: {
              gte: new Date('2026-08-01T00:00:00.000Z'),
              lte: new Date('2026-08-31T23:59:59.999Z'),
            },
          },
        },
        select: { statusLookupValueId: true, schedule: { select: { visitType: true } } },
      });
    });

    it('returns an empty array when no visits match', async () => {
      findMany.mockResolvedValue([]);

      const result = await repository.countByStatusAndCaseType({ sakhiId: 'sakhi-1' });

      expect(result).toEqual([]);
    });
  });

  describe('countCompletedByTypeInWindow', () => {
    const COMPLETED_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';
    const FROM = new Date('2026-08-17T00:00:00.000Z');
    const TO = new Date('2026-08-24T00:00:00.000Z');

    it('returns each in-scope completed visit’s schedule.visitType within the window', async () => {
      findMany.mockResolvedValue([
        { schedule: { visitType: 'ANC' } },
        { schedule: { visitType: 'NN' } },
      ]);

      const result = await repository.countCompletedByTypeInWindow({
        from: FROM,
        to: TO,
        completedStatusLookupValueId: COMPLETED_ID,
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          statusLookupValueId: COMPLETED_ID,
          completedAt: { gte: FROM, lt: TO },
        },
        select: { schedule: { select: { visitType: true } } },
      });
      expect(result).toEqual(['ANC', 'NN']);
    });

    it('applies the sakhiId filter', async () => {
      findMany.mockResolvedValue([]);

      await repository.countCompletedByTypeInWindow({
        sakhiId: 'sakhi-1',
        from: FROM,
        to: TO,
        completedStatusLookupValueId: COMPLETED_ID,
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          statusLookupValueId: COMPLETED_ID,
          completedAt: { gte: FROM, lt: TO },
          sakhiId: 'sakhi-1',
        },
        select: { schedule: { select: { visitType: true } } },
      });
    });

    it('applies the sakhiIds filter', async () => {
      findMany.mockResolvedValue([]);

      await repository.countCompletedByTypeInWindow({
        sakhiIds: ['sakhi-a', 'sakhi-b'],
        from: FROM,
        to: TO,
        completedStatusLookupValueId: COMPLETED_ID,
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          statusLookupValueId: COMPLETED_ID,
          completedAt: { gte: FROM, lt: TO },
          sakhiId: { in: ['sakhi-a', 'sakhi-b'] },
        },
        select: { schedule: { select: { visitType: true } } },
      });
    });

    it('returns an empty array when no completed visits fall in the window', async () => {
      findMany.mockResolvedValue([]);

      const result = await repository.countCompletedByTypeInWindow({
        from: FROM,
        to: TO,
        completedStatusLookupValueId: COMPLETED_ID,
      });

      expect(result).toEqual([]);
    });
  });

  describe('countByBeneficiary', () => {
    it('groups due/overdue counts by beneficiaryId + statusLookupValueId, scoped to the caller', async () => {
      groupBy.mockResolvedValue([
        { beneficiaryId: 'ben-1', statusLookupValueId: PENDING_ID, _count: { _all: 2 } },
      ]);

      const result = await repository.countByBeneficiary(['ben-1'], { sakhiId: 'sakhi-1' });

      expect(groupBy).toHaveBeenCalledWith({
        by: ['beneficiaryId', 'statusLookupValueId'],
        where: {
          isDeleted: false,
          beneficiaryId: { in: ['ben-1'] },
          sakhiId: 'sakhi-1',
        },
        _count: { _all: true },
      });
      expect(result).toEqual([
        { beneficiaryId: 'ben-1', statusLookupValueId: PENDING_ID, _count: { _all: 2 } },
      ]);
    });

    it('applies a sakhiIds roster filter instead of sakhiId when scoped to a roster', async () => {
      groupBy.mockResolvedValue([]);

      await repository.countByBeneficiary(['ben-1'], { sakhiIds: ['sakhi-a', 'sakhi-b'] });

      expect(groupBy).toHaveBeenCalledWith({
        by: ['beneficiaryId', 'statusLookupValueId'],
        where: {
          isDeleted: false,
          beneficiaryId: { in: ['ben-1'] },
          sakhiId: { in: ['sakhi-a', 'sakhi-b'] },
        },
        _count: { _all: true },
      });
    });

    it('applies no sakhi filter when scoping is empty (MANAGER/ADMIN)', async () => {
      groupBy.mockResolvedValue([]);

      await repository.countByBeneficiary(['ben-1'], {});

      expect(groupBy).toHaveBeenCalledWith({
        by: ['beneficiaryId', 'statusLookupValueId'],
        where: {
          isDeleted: false,
          beneficiaryId: { in: ['ben-1'] },
        },
        _count: { _all: true },
      });
    });

    it('returns an empty list without querying when beneficiaryIds is empty', async () => {
      const result = await repository.countByBeneficiary([], { sakhiId: 'sakhi-1' });

      expect(groupBy).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('findDeliveryVisit', () => {
    it('returns the most recent completed DELIVERY visit for the beneficiary', async () => {
      const visit = { actualVisitDate: new Date('2026-05-01') };
      findFirst.mockResolvedValue(visit);

      const result = await repository.findDeliveryVisit('ben-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: {
          beneficiaryId: 'ben-1',
          isDeleted: false,
          actualVisitDate: { not: null },
          schedule: { visitType: 'DELIVERY' },
        },
        orderBy: { actualVisitDate: 'desc' },
        select: { actualVisitDate: true },
      });
      expect(result).toBe(visit);
    });

    it('returns null when there is no completed DELIVERY visit yet', async () => {
      findFirst.mockResolvedValue(null);

      await expect(repository.findDeliveryVisit('ben-1')).resolves.toBeNull();
    });
  });

  describe('findByScheduleId', () => {
    it('returns the non-deleted VisitInstance for the given scheduleId', async () => {
      const visit = { id: 'visit-1', scheduleId: 'schedule-1' };
      findFirst.mockResolvedValue(visit);

      const result = await repository.findByScheduleId('schedule-1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { scheduleId: 'schedule-1', isDeleted: false },
      });
      expect(result).toBe(visit);
    });

    it('returns null when no non-deleted instance exists for the scheduleId', async () => {
      findFirst.mockResolvedValue(null);

      await expect(repository.findByScheduleId('schedule-1')).resolves.toBeNull();
    });
  });

  describe('countCompletedAncVisits', () => {
    const COMPLETED_ID = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    it('counts visits for the beneficiary whose schedule is an ANC-family type and are COMPLETED', async () => {
      count.mockResolvedValue(4);

      const result = await repository.countCompletedAncVisits('ben-1', COMPLETED_ID);

      expect(count).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          beneficiaryId: 'ben-1',
          statusLookupValueId: COMPLETED_ID,
          schedule: { visitType: { in: ['ANC', 'ANC_HR', 'ANC_POST_EDD'] } },
        },
      });
      expect(result).toBe(4);
    });
  });

  describe('countDueTodayByBeneficiary', () => {
    it('groups visit rows by beneficiaryId, filtered to today + the given status ids', async () => {
      findMany.mockResolvedValue([
        { beneficiaryId: 'ben-1' },
        { beneficiaryId: 'ben-1' },
        { beneficiaryId: 'ben-2' },
      ]);

      const result = await repository.countDueTodayByBeneficiary(
        ['ben-1', 'ben-2'],
        [PENDING_ID, MISSED_ID],
        TODAY,
        { sakhiIds: ['ben-1', 'ben-2'] },
      );

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          beneficiaryId: { in: ['ben-1', 'ben-2'] },
          statusLookupValueId: { in: [PENDING_ID, MISSED_ID] },
          schedule: { scheduledDate: TODAY },
          sakhiId: { in: ['ben-1', 'ben-2'] },
        },
        select: { beneficiaryId: true },
      });
      expect(result).toEqual(
        new Map([
          ['ben-1', 2],
          ['ben-2', 1],
        ]),
      );
    });

    it('returns an empty map without querying when beneficiaryIds is empty', async () => {
      const result = await repository.countDueTodayByBeneficiary([], [PENDING_ID], TODAY, {});

      expect(findMany).not.toHaveBeenCalled();
      expect(result).toEqual(new Map());
    });

    it('returns an empty map without querying when dueOrOverdueStatusLookupValueIds is empty', async () => {
      const result = await repository.countDueTodayByBeneficiary(['ben-1'], [], TODAY, {});

      expect(findMany).not.toHaveBeenCalled();
      expect(result).toEqual(new Map());
    });
  });

  describe('findByPada', () => {
    it('returns full visit rows for the given beneficiaries/status/date, scoped to the caller', async () => {
      const rows = [
        {
          id: 'visit-1',
          beneficiaryId: 'ben-1',
          schedule: { visitCode: 'ANC3', scheduledDate: TODAY },
        },
      ];
      findMany.mockResolvedValue(rows);

      const result = await repository.findByPada(['ben-1'], [PENDING_ID], [MISSED_ID], TODAY, {
        sakhiId: 'sakhi-1',
      });

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          beneficiaryId: { in: ['ben-1'] },
          sakhiId: 'sakhi-1',
          OR: [
            { statusLookupValueId: { in: [PENDING_ID] }, schedule: { scheduledDate: TODAY } },
            {
              statusLookupValueId: { in: [MISSED_ID] },
              schedule: { scheduledDate: { lte: TODAY } },
            },
          ],
        },
        select: {
          id: true,
          beneficiaryId: true,
          schedule: { select: { visitCode: true, scheduledDate: true } },
        },
      });
      expect(result).toBe(rows);
    });

    it('a beneficiary with 2 due visits that date returns 2 rows, not deduped', async () => {
      findMany.mockResolvedValue([
        {
          id: 'visit-1',
          beneficiaryId: 'ben-1',
          schedule: { visitCode: 'ANC3', scheduledDate: TODAY },
        },
        {
          id: 'visit-2',
          beneficiaryId: 'ben-1',
          schedule: { visitCode: 'ANC4', scheduledDate: TODAY },
        },
      ]);

      const result = await repository.findByPada(['ben-1'], [PENDING_ID], [], TODAY, {});

      expect(result).toHaveLength(2);
    });

    it('includes a MISSED visit scheduled BEFORE the given date (still overdue today)', async () => {
      const overdueRow = {
        id: 'visit-1',
        beneficiaryId: 'ben-1',
        schedule: { visitCode: 'ANC3', scheduledDate: END_BOUNDARY },
      };
      findMany.mockResolvedValue([overdueRow]);

      const result = await repository.findByPada(['ben-1'], [], [MISSED_ID], TODAY, {});

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              {
                statusLookupValueId: { in: [MISSED_ID] },
                schedule: { scheduledDate: { lte: TODAY } },
              },
            ],
          }),
        }),
      );
      expect(result).toEqual([overdueRow]);
    });

    it('omits the PENDING/MISSED OR branch entirely when its status id list is empty', async () => {
      findMany.mockResolvedValue([]);

      await repository.findByPada(['ben-1'], [PENDING_ID], [], TODAY, {});

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [{ statusLookupValueId: { in: [PENDING_ID] }, schedule: { scheduledDate: TODAY } }],
          }),
        }),
      );
    });

    it('returns an empty list without querying when beneficiaryIds is empty', async () => {
      const result = await repository.findByPada([], [PENDING_ID], [MISSED_ID], TODAY, {});

      expect(findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns an empty list without querying when both status id lists are empty', async () => {
      const result = await repository.findByPada(['ben-1'], [], [], TODAY, {});

      expect(findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });

  describe('findRecentCompletedVisits', () => {
    it('queries completed visits for the beneficiary, newest completedAt first, limited and with no formCode filter when none is given', async () => {
      findMany.mockResolvedValue([]);

      await repository.findRecentCompletedVisits('ben-1', undefined, 2);

      expect(findMany).toHaveBeenCalledWith({
        where: { beneficiaryId: 'ben-1', isDeleted: false, completedAt: { not: null } },
        orderBy: { completedAt: 'desc' },
        take: 2,
        include: {
          schedule: { select: { visitCode: true } },
          formSubmissions: {
            where: { isDeleted: false },
            orderBy: { submittedAt: 'desc' },
            take: 1,
            include: { formVersion: { include: { formDefinition: true } } },
          },
        },
      });
    });

    it('narrows to the given formCodes via the linked submission when provided', async () => {
      findMany.mockResolvedValue([]);

      await repository.findRecentCompletedVisits('ben-1', ['ANC_VISIT'], 2);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            formSubmissions: {
              some: {
                isDeleted: false,
                formVersion: { formDefinition: { formCode: { in: ['ANC_VISIT'] } } },
              },
            },
          }),
        }),
      );
    });

    it('applies no formCode filter when given an empty formCodes array', async () => {
      findMany.mockResolvedValue([]);

      await repository.findRecentCompletedVisits('ben-1', [], 2);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { beneficiaryId: 'ben-1', isDeleted: false, completedAt: { not: null } },
        }),
      );
    });
  });

  describe('updateStatus', () => {
    function buildTxMock() {
      const txUpdateMany = jest.fn().mockResolvedValue({ count: 1 });
      const txCreate = jest.fn().mockResolvedValue({});
      const tx = {
        visitInstance: { updateMany: txUpdateMany },
        visitStatusHistory: { create: txCreate },
      };
      const $transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(tx));
      return { $transaction, txUpdateMany, txCreate };
    }

    it('writes isDeleted/deletedAt when provided in the update payload', async () => {
      const { $transaction, txUpdateMany } = buildTxMock();
      const txRepository = new VisitInstanceRepository({ $transaction } as never);
      const deletedAt = new Date('2026-08-20T00:00:00.000Z');

      await txRepository.updateStatus(
        'visit-1',
        'from-status-id',
        {
          statusLookupValueId: 'discarded-id',
          completedAt: null,
          isDeleted: true,
          deletedAt,
        },
        'caller-1',
      );

      expect(txUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ isDeleted: true, deletedAt }) }),
      );
    });

    it('omits isDeleted/deletedAt from the update payload when not provided (regression guard)', async () => {
      const { $transaction, txUpdateMany } = buildTxMock();
      const txRepository = new VisitInstanceRepository({ $transaction } as never);

      await txRepository.updateStatus(
        'visit-1',
        'from-status-id',
        {
          statusLookupValueId: 'completed-id',
          actualVisitDate: new Date('2026-08-20'),
          meetBeneficiaryFlag: true,
          completedAt: new Date('2026-08-20T10:00:00.000Z'),
        },
        'caller-1',
      );

      const [call] = txUpdateMany.mock.calls;
      expect(call[0].data).not.toHaveProperty('isDeleted');
      expect(call[0].data).not.toHaveProperty('deletedAt');
    });
  });

  describe('markMissedByScheduleId', () => {
    function buildTxMock(targets: { id: string; statusLookupValueId: string | null }[]) {
      const txFindMany = jest.fn().mockResolvedValue(targets);
      const txUpdateMany = jest.fn().mockResolvedValue({ count: targets.length });
      const txCreateMany = jest.fn().mockResolvedValue({ count: targets.length });
      const tx = {
        visitInstance: { findMany: txFindMany, updateMany: txUpdateMany },
        visitStatusHistory: { createMany: txCreateMany },
      };
      const $transaction = jest.fn((fn: (tx: unknown) => unknown) => fn(tx));
      return { $transaction, txFindMany, txUpdateMany, txCreateMany };
    }

    it('flips every not-yet-completed instance on the schedule and writes one VisitStatusHistory row per instance', async () => {
      const { $transaction, txFindMany, txUpdateMany, txCreateMany } = buildTxMock([
        { id: 'vi-1', statusLookupValueId: 'pending-id' },
        { id: 'vi-2', statusLookupValueId: 'pending-id' },
      ]);
      const txRepository = new VisitInstanceRepository({ $transaction } as never);

      const count = await txRepository.markMissedByScheduleId(
        'schedule-1',
        'missed-id',
        'missed-visit-escalation-job',
      );

      expect(count).toBe(2);
      expect(txFindMany).toHaveBeenCalledWith({
        where: { scheduleId: 'schedule-1', isDeleted: false, completedAt: null },
        select: { id: true, statusLookupValueId: true },
      });
      expect(txUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['vi-1', 'vi-2'] } },
        data: { statusLookupValueId: 'missed-id', statusCode: null },
      });
      expect(txCreateMany).toHaveBeenCalledWith({
        data: [
          {
            visitId: 'vi-1',
            fromStatusLookupValueId: 'pending-id',
            toStatusLookupValueId: 'missed-id',
            changedByUserId: 'missed-visit-escalation-job',
            changedAt: expect.any(Date),
          },
          {
            visitId: 'vi-2',
            fromStatusLookupValueId: 'pending-id',
            toStatusLookupValueId: 'missed-id',
            changedByUserId: 'missed-visit-escalation-job',
            changedAt: expect.any(Date),
          },
        ],
      });
    });

    it('does nothing and returns 0 when the schedule has no not-yet-completed instances', async () => {
      const { $transaction, txUpdateMany, txCreateMany } = buildTxMock([]);
      const txRepository = new VisitInstanceRepository({ $transaction } as never);

      const count = await txRepository.markMissedByScheduleId(
        'schedule-1',
        'missed-id',
        'missed-visit-escalation-job',
      );

      expect(count).toBe(0);
      expect(txUpdateMany).not.toHaveBeenCalled();
      expect(txCreateMany).not.toHaveBeenCalled();
    });
  });

  describe('restoreForSakhi', () => {
    const sakhiUserId = '77777777-7777-7777-7777-777777777777';

    it('restores every related table for each soft-deleted visit owned by the Sakhi', async () => {
      findMany.mockResolvedValue([
        { id: 'visit-1', scheduleId: 'schedule-1' },
        { id: 'visit-2', scheduleId: 'schedule-2' },
      ]);
      formSubmissionFindMany.mockResolvedValue([{ id: 'submission-1' }, { id: 'submission-2' }]);

      const result = await repository.restoreForSakhi(sakhiUserId);

      expect(findMany).toHaveBeenCalledWith({
        where: { sakhiId: sakhiUserId, isDeleted: true },
        select: { id: true, scheduleId: true },
      });
      expect(formSubmissionFindMany).toHaveBeenCalledWith({
        where: { visitId: { in: ['visit-1', 'visit-2'] } },
        select: { id: true },
      });
      expect(visitInstanceUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['visit-1', 'visit-2'] } },
        data: { isDeleted: false, deletedAt: null },
      });
      expect(visitScheduleUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['schedule-1', 'schedule-2'] } },
        data: { isDeleted: false, deletedAt: null },
      });
      expect(visitStatusHistoryUpdateMany).toHaveBeenCalledWith({
        where: { visitId: { in: ['visit-1', 'visit-2'] } },
        data: { isDeleted: false, deletedAt: null },
      });
      expect(formSubmissionUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['submission-1', 'submission-2'] } },
        data: { isDeleted: false, deletedAt: null },
      });
      expect(formAnswerUpdateMany).toHaveBeenCalledWith({
        where: { submissionId: { in: ['submission-1', 'submission-2'] } },
        data: { isDeleted: false, deletedAt: null },
      });
      expect(result).toEqual({ restoredVisitCount: 2 });
    });

    it('dedupes schedule ids shared across multiple visits', async () => {
      findMany.mockResolvedValue([
        { id: 'visit-1', scheduleId: 'schedule-1' },
        { id: 'visit-2', scheduleId: 'schedule-1' },
      ]);
      formSubmissionFindMany.mockResolvedValue([]);

      await repository.restoreForSakhi(sakhiUserId);

      expect(visitScheduleUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: ['schedule-1'] } },
        data: { isDeleted: false, deletedAt: null },
      });
    });

    it('is a no-op when the Sakhi has nothing currently soft-deleted', async () => {
      findMany.mockResolvedValue([]);

      const result = await repository.restoreForSakhi(sakhiUserId);

      expect($transaction).not.toHaveBeenCalled();
      expect(formSubmissionFindMany).not.toHaveBeenCalled();
      expect(result).toEqual({ restoredVisitCount: 0 });
    });
  });

  describe('findManyPaginated', () => {
    const row = (n: number, createdAt: string) => ({
      id: `visit-${n}`,
      createdAt: new Date(createdAt),
    });

    it('filters by a single sakhiId when provided', async () => {
      findMany.mockResolvedValue([]);

      await repository.findManyPaginated({ sakhiId: 'sakhi-1', limit: 50 });

      expect(findMany.mock.calls[0][0].where).toEqual({ isDeleted: false, sakhiId: 'sakhi-1' });
    });

    it('filters by sakhiId: { in: [...] } when a sakhiIds array is provided', async () => {
      findMany.mockResolvedValue([]);

      await repository.findManyPaginated({ sakhiIds: ['sakhi-1', 'sakhi-2'], limit: 50 });

      expect(findMany.mock.calls[0][0].where).toEqual({
        isDeleted: false,
        sakhiId: { in: ['sakhi-1', 'sakhi-2'] },
      });
    });

    it('excludes soft-deleted rows even with no sakhi scoping', async () => {
      findMany.mockResolvedValue([]);

      await repository.findManyPaginated({ limit: 50 });

      expect(findMany.mock.calls[0][0].where).toEqual({ isDeleted: false });
    });

    it('returns nextCursor: null when fewer than limit+1 rows exist', async () => {
      findMany.mockResolvedValue([row(1, '2026-08-01T00:00:00.000Z')]);

      const result = await repository.findManyPaginated({ limit: 50 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('returns a nextCursor and trims the extra row when more results exist beyond the limit', async () => {
      findMany.mockResolvedValue([
        row(1, '2026-08-03T00:00:00.000Z'),
        row(2, '2026-08-02T00:00:00.000Z'),
      ]);

      const result = await repository.findManyPaginated({ limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('visit-1');
      expect(result.nextCursor).not.toBeNull();
    });

    it('decodes a supplied cursor into a createdAt/id keyset filter', async () => {
      findMany.mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({ createdAt: '2026-08-05T00:00:00.000Z', id: 'visit-5' }),
      ).toString('base64url');

      await repository.findManyPaginated({ limit: 50, cursor });

      const call = findMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { createdAt: { lt: new Date('2026-08-05T00:00:00.000Z') } },
        { createdAt: new Date('2026-08-05T00:00:00.000Z'), id: { lt: 'visit-5' } },
      ]);
    });

    it('treats a malformed cursor as "start from the beginning" rather than throwing', async () => {
      findMany.mockResolvedValue([]);

      await expect(
        repository.findManyPaginated({ limit: 50, cursor: 'not-a-valid-cursor' }),
      ).resolves.toEqual({ items: [], nextCursor: null });

      expect(findMany.mock.calls[0][0].where.OR).toBeUndefined();
    });
  });
});
