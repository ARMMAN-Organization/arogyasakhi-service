import { correctGradeRanks } from './backfill-grade-rank-from-lookup';

describe('correctGradeRanks', () => {
  const findMany = jest.fn();
  const update = jest.fn();
  const client = { riskFlag: { findMany, update } } as never;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  const idToRank = new Map([
    ['grade-normal', 0],
    ['grade-mild', 1],
    ['grade-moderate', 2],
    ['grade-severe', 3],
  ]);

  it('corrects a row whose blindly-zeroed grade_rank does not match its true resolved grade', async () => {
    findMany.mockResolvedValue([
      { id: 'flag-1', riskGradeLookupValueId: 'grade-severe', gradeRank: 0 },
    ]);

    const summary = await correctGradeRanks(client, idToRank);

    expect(update).toHaveBeenCalledWith({ where: { id: 'flag-1' }, data: { gradeRank: 3 } });
    expect(summary).toEqual({ checked: 1, corrected: 1, unresolved: 0 });
  });

  it('leaves a row alone when its grade_rank already matches the resolved grade', async () => {
    findMany.mockResolvedValue([
      { id: 'flag-1', riskGradeLookupValueId: 'grade-normal', gradeRank: 0 },
    ]);

    const summary = await correctGradeRanks(client, idToRank);

    expect(update).not.toHaveBeenCalled();
    expect(summary).toEqual({ checked: 1, corrected: 0, unresolved: 0 });
  });

  it('counts a row as unresolved and does not update it when its lookup id has no known grade', async () => {
    findMany.mockResolvedValue([
      { id: 'flag-1', riskGradeLookupValueId: 'grade-unknown', gradeRank: 0 },
    ]);

    const summary = await correctGradeRanks(client, idToRank);

    expect(update).not.toHaveBeenCalled();
    expect(summary).toEqual({ checked: 1, corrected: 0, unresolved: 1 });
  });

  it('processes multiple rows independently, mixing corrected/already-correct/unresolved outcomes', async () => {
    findMany.mockResolvedValue([
      { id: 'flag-1', riskGradeLookupValueId: 'grade-severe', gradeRank: 0 },
      { id: 'flag-2', riskGradeLookupValueId: 'grade-normal', gradeRank: 0 },
      { id: 'flag-3', riskGradeLookupValueId: 'grade-unknown', gradeRank: 0 },
    ]);

    const summary = await correctGradeRanks(client, idToRank);

    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith({ where: { id: 'flag-1' }, data: { gradeRank: 3 } });
    expect(summary).toEqual({ checked: 3, corrected: 1, unresolved: 1 });
  });

  it('is a no-op summary when risk_flags is empty (e.g. an environment where the migration ran before any real grading occurred)', async () => {
    findMany.mockResolvedValue([]);

    const summary = await correctGradeRanks(client, idToRank);

    expect(update).not.toHaveBeenCalled();
    expect(summary).toEqual({ checked: 0, corrected: 0, unresolved: 0 });
  });
});
