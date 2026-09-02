import { VisitInstanceRepository } from './visitInstance.repository';

describe('VisitInstanceRepository', () => {
  const count = jest.fn();
  const findMany = jest.fn();
  const groupBy = jest.fn();
  const prisma = { visitInstance: { count, findMany, groupBy } } as never;
  let repository: VisitInstanceRepository;

  const PENDING_ID = 'dddddddd-dddd-dddd-dddd-dddddddddddd';
  const MISSED_ID = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
  const TODAY = new Date('2026-08-17T00:00:00.000Z');
  const END_BOUNDARY = new Date('2026-08-20T00:00:00.000Z');

  beforeEach(() => {
    jest.clearAllMocks();
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
});
