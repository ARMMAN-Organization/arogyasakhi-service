import { VisitInstanceRepository } from './visitInstance.repository';

describe('VisitInstanceRepository', () => {
  const count = jest.fn();
  const findMany = jest.fn();
  const prisma = { visitInstance: { count, findMany } } as never;
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
      );

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          beneficiaryId: { in: ['ben-1', 'ben-2'] },
          statusLookupValueId: { in: [PENDING_ID, MISSED_ID] },
          schedule: { scheduledDate: TODAY },
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
      const result = await repository.countDueTodayByBeneficiary([], [PENDING_ID], TODAY);

      expect(findMany).not.toHaveBeenCalled();
      expect(result).toEqual(new Map());
    });

    it('returns an empty map without querying when dueOrOverdueStatusLookupValueIds is empty', async () => {
      const result = await repository.countDueTodayByBeneficiary(['ben-1'], [], TODAY);

      expect(findMany).not.toHaveBeenCalled();
      expect(result).toEqual(new Map());
    });
  });

  describe('findByPada', () => {
    it('returns full visit rows for the given beneficiaries/status/date', async () => {
      const rows = [
        {
          id: 'visit-1',
          beneficiaryId: 'ben-1',
          schedule: { visitCode: 'ANC3', scheduledDate: TODAY },
        },
      ];
      findMany.mockResolvedValue(rows);

      const result = await repository.findByPada(['ben-1'], [PENDING_ID, MISSED_ID], TODAY);

      expect(findMany).toHaveBeenCalledWith({
        where: {
          isDeleted: false,
          beneficiaryId: { in: ['ben-1'] },
          statusLookupValueId: { in: [PENDING_ID, MISSED_ID] },
          schedule: { scheduledDate: TODAY },
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

      const result = await repository.findByPada(['ben-1'], [PENDING_ID], TODAY);

      expect(result).toHaveLength(2);
    });

    it('returns an empty list without querying when beneficiaryIds is empty', async () => {
      const result = await repository.findByPada([], [PENDING_ID], TODAY);

      expect(findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('returns an empty list without querying when dueOrOverdueStatusLookupValueIds is empty', async () => {
      const result = await repository.findByPada(['ben-1'], [], TODAY);

      expect(findMany).not.toHaveBeenCalled();
      expect(result).toEqual([]);
    });
  });
});
