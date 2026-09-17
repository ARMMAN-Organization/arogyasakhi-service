import { FormRepository } from './form.repository';

describe('FormRepository', () => {
  const findFirst = jest.fn();
  const formSubmissionFindFirst = jest.fn();
  const formSubmissionFindMany = jest.fn();
  const prisma = {
    visitInstance: { findFirst },
    formSubmission: { findFirst: formSubmissionFindFirst, findMany: formSubmissionFindMany },
  } as never;
  let repository: FormRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new FormRepository(prisma);
  });

  describe('findManyPaginated', () => {
    const row = (n: number, submittedAt: string) => ({
      id: `submission-${n}`,
      submittedAt: new Date(submittedAt),
    });

    it('returns an empty page without querying the DB when beneficiaryIds is empty', async () => {
      const result = await repository.findManyPaginated({ beneficiaryIds: [], limit: 50 });

      expect(result).toEqual({ items: [], nextCursor: null });
      expect(formSubmissionFindMany).not.toHaveBeenCalled();
    });

    it('filters by beneficiaryId: { in: [...] } and excludes soft-deleted rows', async () => {
      formSubmissionFindMany.mockResolvedValue([]);

      await repository.findManyPaginated({ beneficiaryIds: ['b-1', 'b-2'], limit: 50 });

      expect(formSubmissionFindMany.mock.calls[0][0].where).toEqual({
        isDeleted: false,
        beneficiaryId: { in: ['b-1', 'b-2'] },
      });
    });

    it('sorts descending (submittedAt desc, id desc)', async () => {
      formSubmissionFindMany.mockResolvedValue([]);

      await repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 50 });

      expect(formSubmissionFindMany.mock.calls[0][0].orderBy).toEqual([
        { submittedAt: 'desc' },
        { id: 'desc' },
      ]);
    });

    it('returns nextCursor: null when fewer than limit+1 rows exist', async () => {
      formSubmissionFindMany.mockResolvedValue([row(1, '2026-08-01T00:00:00.000Z')]);

      const result = await repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 50 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('returns a nextCursor and trims the extra row when more results exist beyond the limit', async () => {
      formSubmissionFindMany.mockResolvedValue([
        row(1, '2026-08-03T00:00:00.000Z'),
        row(2, '2026-08-02T00:00:00.000Z'),
      ]);

      const result = await repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 1 });

      expect(result.items).toHaveLength(1);
      expect(result.items[0].id).toBe('submission-1');
      expect(result.nextCursor).not.toBeNull();
    });

    it('decodes a supplied cursor into a submittedAt/id keyset filter', async () => {
      formSubmissionFindMany.mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({ submittedAt: '2026-08-05T00:00:00.000Z', id: 'submission-5' }),
      ).toString('base64url');

      await repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 50, cursor });

      const call = formSubmissionFindMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { submittedAt: { lt: new Date('2026-08-05T00:00:00.000Z') } },
        { submittedAt: new Date('2026-08-05T00:00:00.000Z'), id: { lt: 'submission-5' } },
      ]);
    });

    it('treats a malformed cursor as "start from the beginning" rather than throwing', async () => {
      formSubmissionFindMany.mockResolvedValue([]);

      await expect(
        repository.findManyPaginated({ beneficiaryIds: ['b-1'], limit: 50, cursor: 'not-valid' }),
      ).resolves.toEqual({ items: [], nextCursor: null });

      expect(formSubmissionFindMany.mock.calls[0][0].where.OR).toBeUndefined();
    });
  });

  describe('findVisitById', () => {
    it('returns the visit row when it exists, belongs to the given beneficiary, and is not deleted', async () => {
      const visit = { id: 'visit-1', beneficiaryId: 'b1', isDeleted: false };
      findFirst.mockResolvedValue(visit);

      const result = await repository.findVisitById('visit-1', 'b1');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'visit-1', beneficiaryId: 'b1', isDeleted: false },
      });
      expect(result).toBe(visit);
    });

    it('returns null when no matching visit exists', async () => {
      findFirst.mockResolvedValue(null);

      const result = await repository.findVisitById('missing-id', 'b1');

      expect(result).toBeNull();
    });

    it('filters on beneficiaryId — a real visit belonging to a different beneficiary does not match', async () => {
      // The mocked findFirst always resolves what it's told to, so this test
      // asserts the *query shape* includes beneficiaryId rather than
      // simulating Prisma's own filtering — the real enforcement is the
      // database query, not application code.
      findFirst.mockResolvedValue(null);

      await repository.findVisitById('visit-1', 'wrong-beneficiary');

      expect(findFirst).toHaveBeenCalledWith({
        where: { id: 'visit-1', beneficiaryId: 'wrong-beneficiary', isDeleted: false },
      });
    });
  });

  describe('findLatestVisitSubmission', () => {
    it('queries visit-linked submissions restricted to the vitals-capturing form codes, ordered most-recent-first', async () => {
      const submission = { id: 'sub-1', beneficiaryId: 'b1' };
      formSubmissionFindFirst.mockResolvedValue(submission);

      const result = await repository.findLatestVisitSubmission('b1');

      expect(formSubmissionFindFirst).toHaveBeenCalledWith({
        where: {
          beneficiaryId: 'b1',
          isDeleted: false,
          visitId: { not: null },
          formVersion: {
            formDefinition: {
              formCode: {
                in: ['ANC_VISIT', 'POSTPARTUM_VISIT', 'NEONATAL_VISIT', 'INC_VISIT', 'CCV_VISIT'],
              },
            },
          },
        },
        orderBy: { submittedAt: 'desc' },
        include: { formVersion: { include: { formDefinition: true } } },
      });
      expect(result).toBe(submission);
    });

    it('returns null when the beneficiary has no visit-linked submission for a vitals-capturing form', async () => {
      formSubmissionFindFirst.mockResolvedValue(null);

      const result = await repository.findLatestVisitSubmission('b1');

      expect(result).toBeNull();
    });
  });

  describe('findSubmissionsByBeneficiaryId', () => {
    const submissionRow = (n: number, overrides: Record<string, unknown> = {}) => ({
      id: `sub-${n}`,
      beneficiaryId: 'b1',
      submittedAt: new Date(`2026-0${n}-01T00:00:00.000Z`),
      formDataJson: { some_field: `value-${n}` },
      visitId: null,
      formVersion: { formDefinition: { formCode: 'ANC_VISIT' } },
      visit: null,
      ...overrides,
    });

    it('queries non-deleted submissions for the given beneficiaryId only, ordered submittedAt asc, id asc', async () => {
      formSubmissionFindMany.mockResolvedValue([]);

      await repository.findSubmissionsByBeneficiaryId('b1', undefined, 50);

      expect(formSubmissionFindMany).toHaveBeenCalledWith({
        where: { beneficiaryId: 'b1', isDeleted: false },
        orderBy: [{ submittedAt: 'asc' }, { id: 'asc' }],
        take: 51,
        include: {
          formVersion: { include: { formDefinition: true } },
          visit: { include: { schedule: true } },
        },
      });
    });

    it('returns items mapped with formCode, submittedAt, answers and null visitSchedule when visitId is null', async () => {
      formSubmissionFindMany.mockResolvedValue([submissionRow(1)]);

      const result = await repository.findSubmissionsByBeneficiaryId('b1', undefined, 50);

      expect(result.items).toEqual([
        {
          submissionId: 'sub-1',
          formCode: 'ANC_VISIT',
          submittedAt: new Date('2026-01-01T00:00:00.000Z'),
          answers: { some_field: 'value-1' },
          visitSchedule: null,
        },
      ]);
      expect(result.nextCursor).toBeNull();
    });

    it('includes visitSchedule context when the submission is visit-linked', async () => {
      formSubmissionFindMany.mockResolvedValue([
        submissionRow(1, {
          visitId: 'visit-1',
          visit: {
            schedule: {
              id: 'schedule-1',
              scheduledDate: new Date('2026-01-05T00:00:00.000Z'),
              status: 'COMPLETED',
              sequenceNo: 3,
            },
          },
        }),
      ]);

      const result = await repository.findSubmissionsByBeneficiaryId('b1', undefined, 50);

      expect(result.items[0].visitSchedule).toEqual({
        scheduleId: 'schedule-1',
        scheduledDate: new Date('2026-01-05T00:00:00.000Z'),
        status: 'COMPLETED',
        sequenceNo: 3,
      });
    });

    it('trims the extra row and returns a nextCursor when more results exist beyond the limit', async () => {
      formSubmissionFindMany.mockResolvedValue([submissionRow(1), submissionRow(2)]);

      const result = await repository.findSubmissionsByBeneficiaryId('b1', undefined, 1);

      expect(result.items).toHaveLength(1);
      expect(result.items[0].submissionId).toBe('sub-1');
      expect(result.nextCursor).not.toBeNull();
    });

    it('reports no nextCursor when results are within the limit', async () => {
      formSubmissionFindMany.mockResolvedValue([submissionRow(1)]);

      const result = await repository.findSubmissionsByBeneficiaryId('b1', undefined, 50);

      expect(result.nextCursor).toBeNull();
    });

    it('decodes a supplied cursor into a submittedAt/id keyset filter', async () => {
      formSubmissionFindMany.mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({ submittedAt: '2026-01-01T00:00:00.000Z', id: 'sub-1' }),
      ).toString('base64url');

      await repository.findSubmissionsByBeneficiaryId('b1', cursor, 50);

      const call = formSubmissionFindMany.mock.calls[0][0];
      expect(call.where.OR).toEqual([
        { submittedAt: { gt: new Date('2026-01-01T00:00:00.000Z') } },
        { submittedAt: new Date('2026-01-01T00:00:00.000Z'), id: { gt: 'sub-1' } },
      ]);
    });

    it('treats a malformed cursor as "start from the beginning" rather than throwing', async () => {
      formSubmissionFindMany.mockResolvedValue([]);

      await expect(
        repository.findSubmissionsByBeneficiaryId('b1', 'not-a-valid-cursor', 50),
      ).resolves.toEqual({ items: [], nextCursor: null });

      expect(formSubmissionFindMany.mock.calls[0][0].where.OR).toBeUndefined();
    });
  });
});
