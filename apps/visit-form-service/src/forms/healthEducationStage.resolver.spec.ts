import {
  ageInMonthsAt,
  gestationalWeeksAt,
  hasStillbirthOutcome,
  resolveStageEducationContent,
} from './healthEducationStage.resolver';
import { resolveHealthEducationMessagesByStage } from './healthEducation.client';

jest.mock('./healthEducation.client');

const resolveHealthEducationMessagesByStageMock = jest.mocked(
  resolveHealthEducationMessagesByStage,
);

const AUTH_HEADER = 'Bearer test-token';

function message(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'msg-1',
    riskConditionId: null,
    conditionLabel: 'Danger Signs during Pregnancy',
    stage: 'Show this for all the ANC visits',
    messageOrder: 1,
    titleEn: 'Danger Signs',
    bodyEn: 'Some symptoms...',
    bodyMarathi: '',
    mediaType: 'TEXT',
    mediaFile: null,
    sortOrder: 1,
    ...overrides,
  };
}

describe('gestationalWeeksAt', () => {
  it('computes whole weeks pregnant, floored', () => {
    // 70 days = exactly 10 weeks
    expect(gestationalWeeksAt('2026-01-01', '2026-03-12')).toBe(10);
  });

  it('floors a partial week down', () => {
    // 76 days = 10 weeks 6 days -> floors to 10
    expect(gestationalWeeksAt('2026-01-01', '2026-03-18')).toBe(10);
  });

  it('returns undefined when visitDate precedes lmpDate', () => {
    expect(gestationalWeeksAt('2026-03-01', '2026-01-01')).toBeUndefined();
  });

  it('returns undefined for an unparseable date', () => {
    expect(gestationalWeeksAt('not-a-date', '2026-03-01')).toBeUndefined();
    expect(gestationalWeeksAt('2026-01-01', 'not-a-date')).toBeUndefined();
  });

  it('returns 0 on the LMP date itself', () => {
    expect(gestationalWeeksAt('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('ageInMonthsAt', () => {
  it('computes whole months of age', () => {
    expect(ageInMonthsAt('2026-01-15', '2026-07-15')).toBe(6);
  });

  it('rounds down when the day-of-month has not yet been reached', () => {
    expect(ageInMonthsAt('2026-01-15', '2026-07-10')).toBe(5);
  });

  it('returns undefined when visitDate precedes birthDate', () => {
    expect(ageInMonthsAt('2026-07-01', '2026-01-01')).toBeUndefined();
  });

  it('returns undefined for an unparseable date', () => {
    expect(ageInMonthsAt('not-a-date', '2026-07-01')).toBeUndefined();
  });

  it('returns 0 on the birth date itself', () => {
    expect(ageInMonthsAt('2026-01-01', '2026-01-01')).toBe(0);
  });
});

describe('hasStillbirthOutcome', () => {
  it('returns true when any outcome is a stillbirth value', () => {
    expect(hasStillbirthOutcome(['live_birth', 'antepartum_still_birth_fresh'])).toBe(true);
    expect(hasStillbirthOutcome(['intrapartum_still_birth_macerated'])).toBe(true);
  });

  it('returns false when every outcome is live_birth', () => {
    expect(hasStillbirthOutcome(['live_birth', 'live_birth'])).toBe(false);
  });

  it('ignores non-string / undefined slots (empty child2/child3 outcome)', () => {
    expect(hasStillbirthOutcome(['live_birth', undefined, null])).toBe(false);
  });

  it('returns false for an empty list', () => {
    expect(hasStillbirthOutcome([])).toBe(false);
  });
});

describe('resolveStageEducationContent', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('ANC unconditional content (Danger Signs)', () => {
    it('is always included regardless of gestational week', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'Show this for all the ANC visits' ? [message()] : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_VISIT', gestationalWeeks: 12 },
        AUTH_HEADER,
      );

      expect(result).toEqual([
        {
          topicCode: 'Danger Signs during Pregnancy',
          topicName: 'Danger Signs',
          mediaType: 'TEXT',
          contentUrl: null,
        },
      ]);
    });

    it('is included even when gestationalWeeks is undefined (LMP unknown)', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'Show this for all the ANC visits' ? [message()] : [],
      );

      const result = await resolveStageEducationContent({ formCode: 'ANC_VISIT' }, AUTH_HEADER);

      expect(result).toHaveLength(1);
    });
  });

  describe('ANC gestational-week-gated content', () => {
    it('includes Primigravida on the first ANC visit within its GA window', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === '1st/2nd trimester (4th month)'
          ? [message({ conditionLabel: 'Primigravida' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_VISIT', gestationalWeeks: 16, isFirstVisitOfFormCode: true },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).toContain('Primigravida');
    });

    it('excludes Primigravida on a later ANC visit even within the same GA window', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === '1st/2nd trimester (4th month)'
          ? [message({ conditionLabel: 'Primigravida' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_VISIT', gestationalWeeks: 16, isFirstVisitOfFormCode: false },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).not.toContain('Primigravida');
    });

    it('excludes Primigravida outside its GA window even on the first visit', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === '1st/2nd trimester (4th month)'
          ? [message({ conditionLabel: 'Primigravida' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_VISIT', gestationalWeeks: 30, isFirstVisitOfFormCode: true },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).not.toContain('Primigravida');
    });

    it('includes Dehydration for any 2nd/3rd trimester week', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'All visits of 2nd and 3rd trimester'
          ? [message({ conditionLabel: 'Dehydration' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_VISIT', gestationalWeeks: 30 },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).toContain('Dehydration');
    });

    it('excludes Dehydration in the 1st trimester', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'All visits of 2nd and 3rd trimester'
          ? [message({ conditionLabel: 'Dehydration' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_VISIT', gestationalWeeks: 10 },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).not.toContain('Dehydration');
    });

    it('omits every GA-gated stage (but keeps unconditional ones) when gestationalWeeks is undefined', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) => [
        message({ conditionLabel: stage }),
      ]);

      const result = await resolveStageEducationContent({ formCode: 'ANC_VISIT' }, AUTH_HEADER);

      // Only the unconditional "Show this for all the ANC visits" stage fires.
      expect(result).toHaveLength(1);
      expect(resolveHealthEducationMessagesByStageMock).toHaveBeenCalledWith(
        'Show this for all the ANC visits',
        AUTH_HEADER,
      );
    });
  });

  describe('PP-phase content', () => {
    it('returns both POSTPARTUM Counselling messages, unconditionally', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'All PP visits'
          ? [
              message({ conditionLabel: 'POSTPARTUM Counselling', messageOrder: 1, sortOrder: 1 }),
              message({
                conditionLabel: 'POSTPARTUM Counselling',
                messageOrder: 2,
                sortOrder: 1,
                id: 'msg-2',
              }),
            ]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'POSTPARTUM_VISIT' },
        AUTH_HEADER,
      );

      expect(result).toHaveLength(2);
    });
  });

  describe('NN-phase content', () => {
    it('returns Neonatal Care content', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'NN1 and NN2' ? [message({ conditionLabel: 'Neonatal Care' })] : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'NEONATAL_VISIT' },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).toEqual(['Neonatal Care']);
    });
  });

  describe('INC-phase content', () => {
    it('always includes Danger Signs, Immunization, and Malnutrition regardless of age', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) => {
        if (stage === 'All INC visit') {
          return [
            message({ conditionLabel: 'Infant Care: Danger Signs', messageOrder: 1 }),
            message({
              conditionLabel: 'Infant Care: Immunization',
              messageOrder: 2,
              mediaType: 'VIDEO',
            }),
          ];
        }
        if (stage === 'All INC visits') {
          return [message({ conditionLabel: 'Malnutrition in Infants', messageOrder: 4 })];
        }
        return [];
      });

      const result = await resolveStageEducationContent({ formCode: 'INC_VISIT' }, AUTH_HEADER);

      const codes = result.map((c) => c.topicCode);
      expect(codes).toEqual(
        expect.arrayContaining([
          'Infant Care: Danger Signs',
          'Infant Care: Immunization',
          'Malnutrition in Infants',
        ]),
      );
      expect(codes).not.toContain('Infant Care: Complementary Feeding');
    });

    it('includes Complementary Feeding when age is within the 6-10 month window', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'All INC visits between 6th and 10th month'
          ? [message({ conditionLabel: 'Infant Care: Complementary Feeding', messageOrder: 3 })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'INC_VISIT', ageInMonths: 7 },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).toContain('Infant Care: Complementary Feeding');
    });

    it('excludes Complementary Feeding when age is below 6 months', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'All INC visits between 6th and 10th month'
          ? [message({ conditionLabel: 'Infant Care: Complementary Feeding' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'INC_VISIT', ageInMonths: 3 },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).not.toContain('Infant Care: Complementary Feeding');
    });

    it('excludes Complementary Feeding when ageInMonths is undefined, but keeps unconditional INC content', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) => {
        if (stage === 'All INC visit')
          return [message({ conditionLabel: 'Infant Care: Danger Signs' })];
        return [];
      });

      const result = await resolveStageEducationContent({ formCode: 'INC_VISIT' }, AUTH_HEADER);

      expect(result.map((c) => c.topicCode)).toEqual(['Infant Care: Danger Signs']);
    });
  });

  describe('closure/delivery-outcome-gated Post-loss content', () => {
    const POST_LOSS_STAGE =
      "If the delivery outcome is 'Still birth' or 'Miscarriage' and 'Abortion' in Closure form";

    it('includes Post-loss content when closureReasonCode is miscarriage', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === POST_LOSS_STAGE
          ? [message({ conditionLabel: 'Post miscarriage/abortion/still birth' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_CLOSURE_VISIT', closureReasonCode: 'miscarriage' },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).toContain('Post miscarriage/abortion/still birth');
    });

    it('includes Post-loss content when closureReasonCode is abortion_spontaneous_induced_mtp', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === POST_LOSS_STAGE
          ? [message({ conditionLabel: 'Post miscarriage/abortion/still birth' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_CLOSURE_VISIT', closureReasonCode: 'abortion_spontaneous_induced_mtp' },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).toContain('Post miscarriage/abortion/still birth');
    });

    it('excludes Post-loss content for a non-loss closure reason', async () => {
      resolveHealthEducationMessagesByStageMock.mockResolvedValue([
        message({ conditionLabel: 'Post miscarriage/abortion/still birth' }),
      ]);

      const result = await resolveStageEducationContent(
        { formCode: 'ANC_CLOSURE_VISIT', closureReasonCode: 'migration' },
        AUTH_HEADER,
      );

      expect(result).toHaveLength(0);
      expect(resolveHealthEducationMessagesByStageMock).not.toHaveBeenCalled();
    });

    it('includes Post-loss content on DELIVERY_VISIT when hasStillbirthOutcome is true', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === POST_LOSS_STAGE
          ? [message({ conditionLabel: 'Post miscarriage/abortion/still birth' })]
          : [],
      );

      const result = await resolveStageEducationContent(
        { formCode: 'DELIVERY_VISIT', hasStillbirthOutcome: true },
        AUTH_HEADER,
      );

      expect(result.map((c) => c.topicCode)).toContain('Post miscarriage/abortion/still birth');
    });

    it('excludes Post-loss content on DELIVERY_VISIT with all live births', async () => {
      resolveHealthEducationMessagesByStageMock.mockResolvedValue([
        message({ conditionLabel: 'Post miscarriage/abortion/still birth' }),
      ]);

      const result = await resolveStageEducationContent(
        { formCode: 'DELIVERY_VISIT', hasStillbirthOutcome: false },
        AUTH_HEADER,
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('unmapped / no-content cases', () => {
    it('returns an empty array for a formCode with no stage-based content at all (e.g. MOTHER_REGISTRATION)', async () => {
      const result = await resolveStageEducationContent(
        { formCode: 'MOTHER_REGISTRATION' },
        AUTH_HEADER,
      );

      expect(result).toEqual([]);
      expect(resolveHealthEducationMessagesByStageMock).not.toHaveBeenCalled();
    });

    it('returns an empty array (not an error) when the client resolves nothing for an applicable stage', async () => {
      resolveHealthEducationMessagesByStageMock.mockResolvedValue([]);

      const result = await resolveStageEducationContent({ formCode: 'ANC_VISIT' }, AUTH_HEADER);

      expect(result).toEqual([]);
    });
  });

  describe('ordering', () => {
    it('sorts resolved content by sortOrder then messageOrder', async () => {
      resolveHealthEducationMessagesByStageMock.mockImplementation(async (stage) =>
        stage === 'Show this for all the ANC visits'
          ? [
              message({ id: 'm-2', sortOrder: 2, messageOrder: 1, titleEn: 'Second' }),
              message({ id: 'm-1', sortOrder: 1, messageOrder: 2, titleEn: 'First' }),
            ]
          : [],
      );

      const result = await resolveStageEducationContent({ formCode: 'ANC_VISIT' }, AUTH_HEADER);

      expect(result.map((c) => c.topicName)).toEqual(['First', 'Second']);
    });
  });
});
