import type { AuthenticatedUser } from '@armman/service-commons';
import { BeneficiaryRiskService } from './beneficiaryRisk.service';
import type { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { resolveRiskGrades } from './riskGrade.client';
import { resolveEducationContent } from './educationContent.client';
import { resolveHealthEducationMessages } from './healthEducation.client';

jest.mock('./sakhi.client');
jest.mock('./riskGrade.client');
jest.mock('./educationContent.client');
jest.mock('./healthEducation.client');

const BENEFICIARY_ID = '11111111-1111-1111-1111-111111111111';
const AUTH_HEADER = 'Bearer test-token';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: '99999999-9999-9999-9999-999999999999',
    roles: ['ADMIN'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'snap-1',
    beneficiaryId: BENEFICIARY_ID,
    phase: 'ANC',
    asOfDate: new Date('2026-06-01'),
    ccvState: null,
    createdAt: new Date('2026-06-01'),
    ...overrides,
  };
}

function assessment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assessment-1',
    evaluatedAt: new Date('2026-06-01'),
    riskPhase: 'ANC',
    overallRiskCategory: 'HIGH',
    overallHighRiskFlag: true,
    hrDetectedFlag: true,
    riskFlags: [
      {
        id: 'flag-1',
        riskGradeLookupValueId: 'grade-1',
        observedValueJson: { systolicBp: 160 },
        isReferralTrigger: true,
        isEducationTrigger: false,
        isHrVisitTrigger: true,
        riskCondition: {
          conditionCode: 'HYPERTENSION_HIGH_BP',
          conditionName: 'Hypertension / High BP',
        },
      },
    ],
    ...overrides,
  };
}

describe('BeneficiaryRiskService', () => {
  const repository = {
    findStateSnapshots: jest.fn(),
    findAssessmentsWithFlags: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryRiskRepository>;
  const beneficiaryClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  const resolveRiskGradesMock = jest.mocked(resolveRiskGrades);
  const resolveEducationContentMock = jest.mocked(resolveEducationContent);
  const resolveHealthEducationMessagesMock = jest.mocked(resolveHealthEducationMessages);
  let service: BeneficiaryRiskService;

  beforeEach(() => {
    jest.resetAllMocks();
    // Safe default for tests that trigger a mapped condition (e.g. ANEMIA)
    // incidentally, without caring about its resolved content — matches the
    // real client's contract of always resolving to an array, never
    // undefined (see healthEducation.client.ts's own doc comment).
    resolveHealthEducationMessagesMock.mockResolvedValue([]);
    service = new BeneficiaryRiskService(repository, beneficiaryClient);
  });

  describe('getRiskProfile', () => {
    it('returns currentState reduced to the most recent snapshot per phase, and mapped assessments', async () => {
      repository.findStateSnapshots.mockResolvedValue([
        snapshot({ id: 'snap-anc-2', phase: 'ANC', asOfDate: new Date('2026-07-01') }),
        snapshot({ id: 'snap-anc-1', phase: 'ANC', asOfDate: new Date('2026-06-01') }),
        snapshot({ id: 'snap-pp-1', phase: 'PP', asOfDate: new Date('2026-05-01') }),
      ] as never);
      repository.findAssessmentsWithFlags.mockResolvedValue([assessment()] as never);

      const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result.beneficiaryId).toBe(BENEFICIARY_ID);
      // Most-recent-per-phase: the newer ANC row wins, the older is dropped.
      expect(result.currentState).toEqual([
        expect.objectContaining({ id: 'snap-anc-2', phase: 'ANC' }),
        expect.objectContaining({ id: 'snap-pp-1', phase: 'PP' }),
      ]);
      expect(result.assessments).toEqual([
        {
          id: 'assessment-1',
          evaluatedAt: assessment().evaluatedAt,
          overallRiskCategory: 'HIGH',
          overallHighRiskFlag: true,
          hrDetectedFlag: true,
          flags: [
            {
              id: 'flag-1',
              conditionCode: 'HYPERTENSION_HIGH_BP',
              conditionName: 'Hypertension / High BP',
              riskGradeLookupValueId: 'grade-1',
              observedValueJson: { systolicBp: 160 },
              isReferralTrigger: true,
              isEducationTrigger: false,
              isHrVisitTrigger: true,
              educationContent: [],
            },
          ],
        },
      ]);
      expect(repository.findStateSnapshots).toHaveBeenCalledWith(BENEFICIARY_ID);
      expect(repository.findAssessmentsWithFlags).toHaveBeenCalledWith(BENEFICIARY_ID);
    });

    it('returns empty currentState/assessments arrays (not a 404) for a beneficiary with no risk data', async () => {
      repository.findStateSnapshots.mockResolvedValue([]);
      repository.findAssessmentsWithFlags.mockResolvedValue([]);

      const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result).toEqual({
        beneficiaryId: BENEFICIARY_ID,
        currentState: [],
        assessments: [],
      });
    });

    it('maps an assessment with multiple flags across different conditions', async () => {
      repository.findStateSnapshots.mockResolvedValue([]);
      repository.findAssessmentsWithFlags.mockResolvedValue([
        assessment({
          riskFlags: [
            {
              id: 'flag-1',
              riskGradeLookupValueId: 'grade-1',
              observedValueJson: null,
              isReferralTrigger: false,
              isEducationTrigger: true,
              isHrVisitTrigger: false,
              riskCondition: { conditionCode: 'ANEMIA', conditionName: 'Anemia' },
            },
            {
              id: 'flag-2',
              riskGradeLookupValueId: 'grade-2',
              observedValueJson: null,
              isReferralTrigger: true,
              isEducationTrigger: false,
              isHrVisitTrigger: true,
              riskCondition: {
                conditionCode: 'SICKLE_CELL_TRAIT',
                conditionName: 'Sickle Cell Trait',
              },
            },
          ],
        }),
      ] as never);

      const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result.assessments[0].flags).toHaveLength(2);
      expect(result.assessments[0].flags.map((f) => f.conditionCode)).toEqual([
        'ANEMIA',
        'SICKLE_CELL_TRAIT',
      ]);
    });

    it('allows a SAKHI caller to read her own beneficiary', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'sakhi-1',
      } as never);
      repository.findStateSnapshots.mockResolvedValue([]);
      repository.findAssessmentsWithFlags.mockResolvedValue([]);

      await service.getRiskProfile(
        BENEFICIARY_ID,
        caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(repository.findStateSnapshots).toHaveBeenCalledWith(BENEFICIARY_ID);
    });

    it('403s when a SAKHI caller targets a beneficiary that is not her own', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'some-other-sakhi',
      } as never);

      await expect(
        service.getRiskProfile(
          BENEFICIARY_ID,
          caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('You do not have access to this beneficiary.');
      expect(repository.findStateSnapshots).not.toHaveBeenCalled();
    });

    it("403s when a SUPERVISOR caller's roster does not include the beneficiary's Sakhi", async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'some-other-sakhi',
      } as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);

      await expect(
        service.getRiskProfile(
          BENEFICIARY_ID,
          caller({ id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow("This beneficiary is outside this Supervisor's roster.");
    });

    it("allows a SUPERVISOR caller whose roster includes the beneficiary's Sakhi", async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'sakhi-a',
      } as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a', 'sakhi-b']);
      repository.findStateSnapshots.mockResolvedValue([]);
      repository.findAssessmentsWithFlags.mockResolvedValue([]);

      await service.getRiskProfile(
        BENEFICIARY_ID,
        caller({ id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
        AUTH_HEADER,
      );

      expect(repository.findStateSnapshots).toHaveBeenCalledWith(BENEFICIARY_ID);
    });

    it('leaves a MANAGER/ADMIN caller unscoped, without calling beneficiary-service', async () => {
      repository.findStateSnapshots.mockResolvedValue([]);
      repository.findAssessmentsWithFlags.mockResolvedValue([]);

      await service.getRiskProfile(BENEFICIARY_ID, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
      expect(repository.findStateSnapshots).toHaveBeenCalledWith(BENEFICIARY_ID);
    });

    it('404s when the beneficiary does not exist in beneficiary-service', async () => {
      beneficiaryClient.getById.mockResolvedValue(null);

      await expect(
        service.getRiskProfile(
          BENEFICIARY_ID,
          caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Beneficiary not found.');
      expect(repository.findStateSnapshots).not.toHaveBeenCalled();
    });

    it('attaches the COMING_SOON placeholder to a flag with isEducationTrigger true whose condition is unmapped', async () => {
      const COMING_SOON = {
        topicCode: 'COMING_SOON',
        topicName: 'Content coming soon',
        mediaType: 'QNA_TEXT',
        contentUrl: null,
      };
      resolveEducationContentMock.mockResolvedValue(COMING_SOON);
      repository.findStateSnapshots.mockResolvedValue([]);
      repository.findAssessmentsWithFlags.mockResolvedValue([
        assessment({
          riskPhase: 'ANC',
          riskFlags: [
            {
              id: 'flag-1',
              riskGradeLookupValueId: 'grade-1',
              observedValueJson: null,
              isReferralTrigger: false,
              isEducationTrigger: true,
              isHrVisitTrigger: false,
              // APH isn't in CONDITION_CODE_TO_LABEL — falls back to COMING_SOON.
              riskCondition: { conditionCode: 'APH', conditionName: 'Antepartum Haemorrhage' },
            },
          ],
        }),
      ] as never);

      const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result.assessments[0].flags[0].educationContent).toEqual([COMING_SOON]);
      expect(resolveEducationContentMock).toHaveBeenCalledWith('COMING_SOON', AUTH_HEADER);
      expect(resolveHealthEducationMessagesMock).not.toHaveBeenCalled();
    });

    it('does not resolve any content for a flag with isEducationTrigger false', async () => {
      repository.findStateSnapshots.mockResolvedValue([]);
      repository.findAssessmentsWithFlags.mockResolvedValue([assessment()] as never); // isEducationTrigger: false

      const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result.assessments[0].flags[0].educationContent).toEqual([]);
      expect(resolveEducationContentMock).not.toHaveBeenCalled();
      expect(resolveHealthEducationMessagesMock).not.toHaveBeenCalled();
    });

    it('sets educationContent to an empty array (not an error) when cms-content-service resolution fails for an unmapped condition', async () => {
      resolveEducationContentMock.mockResolvedValue(null);
      repository.findStateSnapshots.mockResolvedValue([]);
      repository.findAssessmentsWithFlags.mockResolvedValue([
        assessment({
          riskPhase: 'ANC',
          riskFlags: [
            {
              id: 'flag-1',
              riskGradeLookupValueId: 'grade-1',
              observedValueJson: null,
              isReferralTrigger: false,
              isEducationTrigger: true,
              isHrVisitTrigger: false,
              riskCondition: { conditionCode: 'APH', conditionName: 'Antepartum Haemorrhage' },
            },
          ],
        }),
      ] as never);

      const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result.assessments[0].flags[0].educationContent).toEqual([]);
    });

    it('resolves COMING_SOON only once even with multiple triggered flags across assessments, for an unmapped condition', async () => {
      const COMING_SOON = {
        topicCode: 'COMING_SOON',
        topicName: 'Content coming soon',
        mediaType: 'QNA_TEXT',
        contentUrl: null,
      };
      resolveEducationContentMock.mockResolvedValue(COMING_SOON);
      repository.findStateSnapshots.mockResolvedValue([]);
      const triggeredFlag = (id: string) => ({
        id,
        riskGradeLookupValueId: 'grade-1',
        observedValueJson: null,
        isReferralTrigger: false,
        isEducationTrigger: true,
        isHrVisitTrigger: false,
        riskCondition: { conditionCode: 'APH', conditionName: 'Antepartum Haemorrhage' },
      });
      repository.findAssessmentsWithFlags.mockResolvedValue([
        assessment({
          id: 'a-1',
          riskPhase: 'ANC',
          riskFlags: [triggeredFlag('flag-1'), triggeredFlag('flag-2')],
        }),
        assessment({ id: 'a-2', riskPhase: 'ANC', riskFlags: [triggeredFlag('flag-3')] }),
      ] as never);

      await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(resolveEducationContentMock).toHaveBeenCalledTimes(1);
    });

    describe('the 5 SRS-mapped, risk-graded conditions (real content, not COMING_SOON)', () => {
      const anemiaAncMessage = {
        id: 'msg-1',
        riskConditionId: null,
        conditionLabel: 'Anemia',
        stage: 'as soon as detected during ANC visit',
        messageOrder: 1,
        titleEn: 'Understanding Anemia',
        bodyEn: 'Low Hb...',
        bodyMarathi: '',
        mediaType: 'TEXT',
        mediaFile: null,
        sortOrder: 1,
      };
      const anemiaPpMessage = {
        id: 'msg-2',
        riskConditionId: null,
        conditionLabel: 'Anemia',
        stage: 'postpartum (PP1 or PP2 whichever is attended)',
        messageOrder: 2,
        titleEn: 'Postpartum Counselling',
        bodyEn: 'Focus: Monitoring Hb...',
        bodyMarathi: '',
        mediaType: 'TEXT',
        mediaFile: null,
        sortOrder: 1,
      };

      const mappedFlag = (conditionCode: string) => ({
        id: 'flag-1',
        riskGradeLookupValueId: 'grade-1',
        observedValueJson: null,
        isReferralTrigger: false,
        isEducationTrigger: true,
        isHrVisitTrigger: false,
        riskCondition: { conditionCode, conditionName: conditionCode },
      });

      it.each([
        ['ANEMIA', 'Anemia'],
        ['HYPERTENSION', 'Gestational Hypertension'],
        ['HYPERGLYCEMIA', 'Gestational Diabetes'],
        ['GESTATIONAL_WEIGHT_GAIN', 'Inadequate Gestational weight gain'],
        ['BAD_OBSTETRIC_HISTORY', 'Previous pregnancy complication'],
      ])('maps %s to conditionLabel %s and resolves real content', async (conditionCode, label) => {
        resolveHealthEducationMessagesMock.mockResolvedValue([anemiaAncMessage]);
        repository.findStateSnapshots.mockResolvedValue([]);
        repository.findAssessmentsWithFlags.mockResolvedValue([
          assessment({ riskPhase: 'ANC', riskFlags: [mappedFlag(conditionCode)] }),
        ] as never);

        const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

        expect(resolveHealthEducationMessagesMock).toHaveBeenCalledWith(label, AUTH_HEADER);
        expect(result.assessments[0].flags[0].educationContent).toEqual([
          {
            topicCode: conditionCode,
            topicName: 'Understanding Anemia',
            mediaType: 'TEXT',
            contentUrl: null,
          },
        ]);
      });

      it('regression: does NOT map DANGER_SIGNS or INFANT_DANGER_SIGNS here (they are Group B, stage-based, not risk-graded)', async () => {
        const COMING_SOON = {
          topicCode: 'COMING_SOON',
          topicName: 'Content coming soon',
          mediaType: 'QNA_TEXT',
          contentUrl: null,
        };
        resolveEducationContentMock.mockResolvedValue(COMING_SOON);
        repository.findStateSnapshots.mockResolvedValue([]);
        repository.findAssessmentsWithFlags.mockResolvedValue([
          assessment({
            riskPhase: 'ANC',
            riskFlags: [mappedFlag('DANGER_SIGNS'), mappedFlag('INFANT_DANGER_SIGNS')],
          }),
        ] as never);

        const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

        expect(resolveHealthEducationMessagesMock).not.toHaveBeenCalled();
        expect(result.assessments[0].flags[0].educationContent).toEqual([COMING_SOON]);
        expect(result.assessments[0].flags[1].educationContent).toEqual([COMING_SOON]);
      });

      it('on an ANC-phase assessment, returns every non-postpartum message for the condition, ordered', async () => {
        resolveHealthEducationMessagesMock.mockResolvedValue([anemiaPpMessage, anemiaAncMessage]); // out of order on purpose
        repository.findStateSnapshots.mockResolvedValue([]);
        repository.findAssessmentsWithFlags.mockResolvedValue([
          assessment({ riskPhase: 'ANC', riskFlags: [mappedFlag('ANEMIA')] }),
        ] as never);

        const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

        expect(result.assessments[0].flags[0].educationContent).toEqual([
          {
            topicCode: 'ANEMIA',
            topicName: anemiaAncMessage.titleEn,
            mediaType: anemiaAncMessage.mediaType,
            contentUrl: null,
          },
        ]);
      });

      it('on a PP-phase assessment, returns only the postpartum message for the condition', async () => {
        resolveHealthEducationMessagesMock.mockResolvedValue([anemiaAncMessage, anemiaPpMessage]);
        repository.findStateSnapshots.mockResolvedValue([]);
        repository.findAssessmentsWithFlags.mockResolvedValue([
          assessment({ riskPhase: 'PP', riskFlags: [mappedFlag('ANEMIA')] }),
        ] as never);

        const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

        expect(result.assessments[0].flags[0].educationContent).toEqual([
          {
            topicCode: 'ANEMIA',
            topicName: anemiaPpMessage.titleEn,
            mediaType: anemiaPpMessage.mediaType,
            contentUrl: null,
          },
        ]);
      });

      it('with riskPhase null (legacy pre-migration row), returns every message for the condition undifferentiated', async () => {
        resolveHealthEducationMessagesMock.mockResolvedValue([anemiaAncMessage, anemiaPpMessage]);
        repository.findStateSnapshots.mockResolvedValue([]);
        repository.findAssessmentsWithFlags.mockResolvedValue([
          assessment({ riskPhase: null, riskFlags: [mappedFlag('ANEMIA')] }),
        ] as never);

        const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

        expect(result.assessments[0].flags[0].educationContent).toEqual([
          expect.objectContaining({ topicName: anemiaAncMessage.titleEn }),
          expect.objectContaining({ topicName: anemiaPpMessage.titleEn }),
        ]);
      });

      it('falls back to COMING_SOON when a mapped condition has zero seeded content rows', async () => {
        const COMING_SOON = {
          topicCode: 'COMING_SOON',
          topicName: 'Content coming soon',
          mediaType: 'QNA_TEXT',
          contentUrl: null,
        };
        resolveEducationContentMock.mockResolvedValue(COMING_SOON);
        resolveHealthEducationMessagesMock.mockResolvedValue([]);
        repository.findStateSnapshots.mockResolvedValue([]);
        repository.findAssessmentsWithFlags.mockResolvedValue([
          assessment({ riskPhase: 'ANC', riskFlags: [mappedFlag('ANEMIA')] }),
        ] as never);

        const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

        expect(result.assessments[0].flags[0].educationContent).toEqual([COMING_SOON]);
      });

      it('resolves real content only once per (conditionCode, phase) pair, even across multiple assessments/flags', async () => {
        resolveHealthEducationMessagesMock.mockResolvedValue([anemiaAncMessage]);
        repository.findStateSnapshots.mockResolvedValue([]);
        repository.findAssessmentsWithFlags.mockResolvedValue([
          assessment({
            id: 'a-1',
            riskPhase: 'ANC',
            riskFlags: [
              { ...mappedFlag('ANEMIA'), id: 'flag-1' },
              { ...mappedFlag('ANEMIA'), id: 'flag-2' },
            ],
          }),
          assessment({
            id: 'a-2',
            riskPhase: 'ANC',
            riskFlags: [{ ...mappedFlag('ANEMIA'), id: 'flag-3' }],
          }),
        ] as never);

        await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

        expect(resolveHealthEducationMessagesMock).toHaveBeenCalledTimes(1);
      });

      it('does NOT collapse riskPhase null and riskPhase ANC onto the same cache bucket (PR #222 review finding)', async () => {
        // Both cases share isPostpartum === false under the old, collapsed
        // cache key (`${conditionCode}:${isPostpartum}`) — this test
        // proves a null-phase flag (meant to get every message,
        // undifferentiated) and an ANC-phase flag (meant to get only
        // non-postpartum messages) resolve independently within one call,
        // even though toAssessmentView resolves every flag concurrently
        // via Promise.all and whichever reached the cache first would
        // previously have silently decided both.
        resolveHealthEducationMessagesMock.mockResolvedValue([anemiaAncMessage, anemiaPpMessage]);
        repository.findStateSnapshots.mockResolvedValue([]);
        repository.findAssessmentsWithFlags.mockResolvedValue([
          assessment({ id: 'a-legacy', riskPhase: null, riskFlags: [mappedFlag('ANEMIA')] }),
          assessment({ id: 'a-anc', riskPhase: 'ANC', riskFlags: [mappedFlag('ANEMIA')] }),
        ] as never);

        const result = await service.getRiskProfile(BENEFICIARY_ID, caller(), AUTH_HEADER);

        // findAssessmentsWithFlags returns most-recent-evaluatedAt-first
        // (see repository); both fixtures share assessment()'s default
        // evaluatedAt, so toAssessmentView preserves the mocked array's own
        // order — a-legacy first, a-anc second, as returned above.
        expect(result.assessments).toHaveLength(2);
        const [legacyAssessment, ancAssessment] = result.assessments;
        const legacyFlag = legacyAssessment.flags[0];
        const ancFlag = ancAssessment.flags[0];

        // riskPhase null -> every message, undifferentiated (both ANC and
        // PP messages present).
        expect(legacyFlag.educationContent).toEqual([
          expect.objectContaining({ topicName: anemiaAncMessage.titleEn }),
          expect.objectContaining({ topicName: anemiaPpMessage.titleEn }),
        ]);
        // riskPhase 'ANC' -> only the non-postpartum message — must NOT
        // include the postpartum one, even resolved in the same call.
        expect(ancFlag.educationContent).toEqual([
          expect.objectContaining({ topicName: anemiaAncMessage.titleEn }),
        ]);
      });
    });
  });

  describe('getRiskState', () => {
    const GRADES = new Map([
      ['grade-mild', { code: 'MILD', sortOrder: 1 }],
      ['grade-moderate', { code: 'MODERATE', sortOrder: 2 }],
      ['grade-severe', { code: 'SEVERE', sortOrder: 3 }],
    ]);

    function flagged(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'flag-1',
        riskConditionId: 'condition-1',
        riskGradeLookupValueId: 'grade-mild',
        observedValueJson: { value: 1 },
        isReferralTrigger: false,
        isEducationTrigger: false,
        isHrVisitTrigger: false,
        riskCondition: {
          conditionCode: 'ANEMIA',
          conditionName: 'Anemia',
          phase: 'ANC',
        },
        ...overrides,
      };
    }

    it('worsening grade across 2 assessments: baseline = earliest, latest = most recent, everHighest = the worse of the two', async () => {
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      // desc order (most-recent-first), matching the repository's real ordering.
      repository.findAssessmentsWithFlags.mockResolvedValue([
        assessment({
          id: 'assessment-2',
          evaluatedAt: new Date('2026-07-01'),
          riskFlags: [flagged({ riskGradeLookupValueId: 'grade-severe' })],
        }),
        assessment({
          id: 'assessment-1',
          evaluatedAt: new Date('2026-06-01'),
          riskFlags: [flagged({ riskGradeLookupValueId: 'grade-mild' })],
        }),
      ] as never);

      const result = await service.getRiskState(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result.riskConditionSummaries).toEqual([
        expect.objectContaining({
          riskConditionId: 'condition-1',
          baselineGrade: 'MILD',
          baselineAssessedAt: new Date('2026-06-01'),
          latestGrade: 'SEVERE',
          latestAssessedAt: new Date('2026-07-01'),
          everHighestGrade: 'SEVERE',
          everAtRiskFlag: true,
        }),
      ]);
    });

    it('a condition flagged only once: baseline == latest == everHighest', async () => {
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      repository.findAssessmentsWithFlags.mockResolvedValue([
        assessment({ riskFlags: [flagged({ riskGradeLookupValueId: 'grade-moderate' })] }),
      ] as never);

      const result = await service.getRiskState(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result.riskConditionSummaries).toHaveLength(1);
      const [summary] = result.riskConditionSummaries;
      expect(summary.baselineGrade).toBe('MODERATE');
      expect(summary.latestGrade).toBe('MODERATE');
      expect(summary.everHighestGrade).toBe('MODERATE');
      expect(summary.baselineAssessedAt).toEqual(summary.latestAssessedAt);
    });

    it('multiple distinct conditions produce one summary object each, not merged', async () => {
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      repository.findAssessmentsWithFlags.mockResolvedValue([
        assessment({
          riskFlags: [
            flagged({ riskConditionId: 'condition-1', riskGradeLookupValueId: 'grade-mild' }),
            flagged({ riskConditionId: 'condition-2', riskGradeLookupValueId: 'grade-severe' }),
          ],
        }),
      ] as never);

      const result = await service.getRiskState(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result.riskConditionSummaries.map((s) => s.riskConditionId).sort()).toEqual([
        'condition-1',
        'condition-2',
      ]);
    });

    it('propagates a grade-lookup resolution failure rather than returning a partial response', async () => {
      repository.findAssessmentsWithFlags.mockResolvedValue([
        assessment({ riskFlags: [flagged()] }),
      ] as never);
      resolveRiskGradesMock.mockRejectedValue(new Error('Unable to resolve RISK_GRADE.'));

      await expect(service.getRiskState(BENEFICIARY_ID, caller(), AUTH_HEADER)).rejects.toThrow(
        'Unable to resolve RISK_GRADE.',
      );
    });

    it('returns an empty riskConditionSummaries array (not a 404) for a beneficiary with no risk flags ever', async () => {
      repository.findAssessmentsWithFlags.mockResolvedValue([]);

      const result = await service.getRiskState(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result).toEqual({ beneficiaryId: BENEFICIARY_ID, riskConditionSummaries: [] });
      expect(resolveRiskGradesMock).not.toHaveBeenCalled();
    });

    it('403s when a SAKHI caller targets a beneficiary that is not her own — same scoping as getRiskProfile', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'some-other-sakhi',
      } as never);

      await expect(
        service.getRiskState(
          BENEFICIARY_ID,
          caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('You do not have access to this beneficiary.');
      expect(repository.findAssessmentsWithFlags).not.toHaveBeenCalled();
    });

    it('leaves a MANAGER/ADMIN caller unscoped, without calling beneficiary-service', async () => {
      repository.findAssessmentsWithFlags.mockResolvedValue([]);

      await service.getRiskState(BENEFICIARY_ID, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
      expect(repository.findAssessmentsWithFlags).toHaveBeenCalledWith(BENEFICIARY_ID);
    });
  });
});
