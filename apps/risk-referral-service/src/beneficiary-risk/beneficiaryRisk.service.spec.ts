import { BeneficiaryRiskService } from './beneficiaryRisk.service';
import type { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';

const BENEFICIARY_ID = '11111111-1111-1111-1111-111111111111';

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
  let service: BeneficiaryRiskService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new BeneficiaryRiskService(repository);
  });

  describe('getRiskProfile', () => {
    it('returns currentState reduced to the most recent snapshot per phase, and mapped assessments', async () => {
      repository.findStateSnapshots.mockResolvedValue([
        snapshot({ id: 'snap-anc-2', phase: 'ANC', asOfDate: new Date('2026-07-01') }),
        snapshot({ id: 'snap-anc-1', phase: 'ANC', asOfDate: new Date('2026-06-01') }),
        snapshot({ id: 'snap-pp-1', phase: 'PP', asOfDate: new Date('2026-05-01') }),
      ] as never);
      repository.findAssessmentsWithFlags.mockResolvedValue([assessment()] as never);

      const result = await service.getRiskProfile(BENEFICIARY_ID);

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

      const result = await service.getRiskProfile(BENEFICIARY_ID);

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

      const result = await service.getRiskProfile(BENEFICIARY_ID);

      expect(result.assessments[0].flags).toHaveLength(2);
      expect(result.assessments[0].flags.map((f) => f.conditionCode)).toEqual([
        'ANEMIA',
        'SICKLE_CELL_TRAIT',
      ]);
    });
  });
});
