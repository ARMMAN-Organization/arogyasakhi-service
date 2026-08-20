import type { AuthenticatedUser } from '@armman/service-commons';
import { BeneficiaryRiskService } from './beneficiaryRisk.service';
import type { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { resolveRiskGrades } from './riskGrade.client';

jest.mock('./sakhi.client');
jest.mock('./riskGrade.client');

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
  let service: BeneficiaryRiskService;

  beforeEach(() => {
    jest.resetAllMocks();
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
