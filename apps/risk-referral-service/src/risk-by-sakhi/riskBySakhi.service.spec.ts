import type { AuthenticatedUser } from '@armman/service-commons';
import { RiskBySakhiService } from './riskBySakhi.service';
import type { RiskBySakhiRepository } from './riskBySakhi.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { resolveRiskGrades } from './riskGrade.client';

jest.mock('./sakhi.client');
jest.mock('./riskGrade.client');

const SAKHI_ID = 'sakhi-1';
const BENEFICIARY_A = '11111111-1111-1111-1111-111111111111';
const BENEFICIARY_B = '22222222-2222-2222-2222-222222222222';
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

function assessment(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'assessment-1',
    beneficiaryId: BENEFICIARY_A,
    evaluatedAt: new Date('2026-06-01'),
    overallRiskCategory: 'HIGH',
    overallHighRiskFlag: true,
    hrDetectedFlag: true,
    riskFlags: [
      {
        id: 'flag-1',
        riskConditionId: 'condition-1',
        riskGradeLookupValueId: 'grade-mild',
        observedValueJson: { systolicBp: 160 },
        isReferralTrigger: true,
        isEducationTrigger: false,
        isHrVisitTrigger: true,
        riskCondition: {
          conditionCode: 'HYPERTENSION_HIGH_BP',
          conditionName: 'Hypertension / High BP',
          phase: 'ANC',
        },
      },
    ],
    ...overrides,
  };
}

describe('RiskBySakhiService', () => {
  const repository = {
    findAssessmentsWithFlagsForBeneficiaries: jest.fn(),
  } as unknown as jest.Mocked<RiskBySakhiRepository>;
  const beneficiaryClient = {
    getIds: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  const resolveRiskGradesMock = jest.mocked(resolveRiskGrades);
  let service: RiskBySakhiService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new RiskBySakhiService(repository, beneficiaryClient);
  });

  const GRADES = new Map([
    ['grade-mild', { code: 'MILD', sortOrder: 1 }],
    ['grade-severe', { code: 'SEVERE', sortOrder: 3 }],
  ]);

  describe('scoping', () => {
    it('allows a SAKHI caller requesting her own sakhiId', async () => {
      beneficiaryClient.getIds.mockResolvedValue([]);

      await service.getRiskBySakhi(
        SAKHI_ID,
        undefined,
        caller({ id: SAKHI_ID, roles: ['SAKHI'] }),
        AUTH_HEADER,
      );

      expect(beneficiaryClient.getIds).toHaveBeenCalledWith(AUTH_HEADER, SAKHI_ID);
    });

    it('403s a SAKHI caller requesting a different sakhiId, without calling beneficiary-service', async () => {
      await expect(
        service.getRiskBySakhi(
          SAKHI_ID,
          undefined,
          caller({ id: 'some-other-sakhi', roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('You do not have access to this Sakhi.');
      expect(beneficiaryClient.getIds).not.toHaveBeenCalled();
    });

    it('allows a SUPERVISOR caller whose roster includes the sakhiId', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue([SAKHI_ID, 'sakhi-2']);
      beneficiaryClient.getIds.mockResolvedValue([]);

      await service.getRiskBySakhi(
        SAKHI_ID,
        undefined,
        caller({ id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
        AUTH_HEADER,
      );

      expect(beneficiaryClient.getIds).toHaveBeenCalledWith(AUTH_HEADER, SAKHI_ID);
    });

    it('403s a SUPERVISOR caller whose roster does not include the sakhiId, without calling beneficiary-service', async () => {
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-2', 'sakhi-3']);

      await expect(
        service.getRiskBySakhi(
          SAKHI_ID,
          undefined,
          caller({ id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow("This Sakhi is outside this Supervisor's roster.");
      expect(beneficiaryClient.getIds).not.toHaveBeenCalled();
    });

    it('403s a SUPERVISOR caller with no project scope, without resolving a roster', async () => {
      await expect(
        service.getRiskBySakhi(
          SAKHI_ID,
          undefined,
          caller({ id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: null }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Supervisor caller has no project scope.');
      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
    });

    it('leaves a MANAGER caller unscoped, without any roster check', async () => {
      beneficiaryClient.getIds.mockResolvedValue([]);

      await service.getRiskBySakhi(
        SAKHI_ID,
        undefined,
        caller({ roles: ['MANAGER'] }),
        AUTH_HEADER,
      );

      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
      expect(beneficiaryClient.getIds).toHaveBeenCalledWith(AUTH_HEADER, SAKHI_ID);
    });

    it('leaves an ADMIN caller unscoped, without any roster check', async () => {
      beneficiaryClient.getIds.mockResolvedValue([]);

      await service.getRiskBySakhi(SAKHI_ID, undefined, caller({ roles: ['ADMIN'] }), AUTH_HEADER);

      expect(listSakhiIdsForSupervisorMock).not.toHaveBeenCalled();
      expect(beneficiaryClient.getIds).toHaveBeenCalledWith(AUTH_HEADER, SAKHI_ID);
    });
  });

  describe('beneficiary resolution', () => {
    it('returns an empty beneficiaries array (not a 404) when the Sakhi has no beneficiaries, without querying the repository', async () => {
      beneficiaryClient.getIds.mockResolvedValue([]);

      const result = await service.getRiskBySakhi(SAKHI_ID, undefined, caller(), AUTH_HEADER);

      expect(result).toEqual({ sakhiId: SAKHI_ID, type: null, beneficiaries: [] });
      expect(repository.findAssessmentsWithFlagsForBeneficiaries).not.toHaveBeenCalled();
    });

    it('propagates a beneficiary-service resolution failure', async () => {
      beneficiaryClient.getIds.mockRejectedValue(new Error('beneficiary-service is unreachable.'));

      await expect(
        service.getRiskBySakhi(SAKHI_ID, undefined, caller(), AUTH_HEADER),
      ).rejects.toThrow('beneficiary-service is unreachable.');
    });
  });

  describe('aggregation', () => {
    it('groups risk-condition summaries per beneficiary, without cross-beneficiary bleed', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A, BENEFICIARY_B]);
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      repository.findAssessmentsWithFlagsForBeneficiaries.mockResolvedValue([
        assessment({
          beneficiaryId: BENEFICIARY_A,
          riskFlags: [
            {
              id: 'flag-a',
              riskConditionId: 'condition-a',
              riskGradeLookupValueId: 'grade-mild',
              observedValueJson: null,
              isReferralTrigger: false,
              isEducationTrigger: false,
              isHrVisitTrigger: false,
              riskCondition: { conditionCode: 'ANEMIA', conditionName: 'Anemia', phase: 'ANC' },
            },
          ],
        }),
        assessment({
          id: 'assessment-2',
          beneficiaryId: BENEFICIARY_B,
          riskFlags: [
            {
              id: 'flag-b',
              riskConditionId: 'condition-b',
              riskGradeLookupValueId: 'grade-severe',
              observedValueJson: null,
              isReferralTrigger: true,
              isEducationTrigger: false,
              isHrVisitTrigger: true,
              riskCondition: {
                conditionCode: 'SICKLE_CELL_TRAIT',
                conditionName: 'Sickle Cell Trait',
                phase: 'ANC',
              },
            },
          ],
        }),
      ] as never);

      const result = await service.getRiskBySakhi(SAKHI_ID, undefined, caller(), AUTH_HEADER);

      expect(result.beneficiaries).toHaveLength(2);
      expect(
        result.beneficiaries.find((b) => b.beneficiaryId === BENEFICIARY_A)?.riskConditionSummaries,
      ).toEqual([expect.objectContaining({ riskConditionId: 'condition-a', latestGrade: 'MILD' })]);
      expect(
        result.beneficiaries.find((b) => b.beneficiaryId === BENEFICIARY_B)?.riskConditionSummaries,
      ).toEqual([
        expect.objectContaining({ riskConditionId: 'condition-b', latestGrade: 'SEVERE' }),
      ]);
    });

    it('includes a beneficiary with zero assessments, with an empty riskConditionSummaries array, and skips grade resolution', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A]);
      repository.findAssessmentsWithFlagsForBeneficiaries.mockResolvedValue([]);

      const result = await service.getRiskBySakhi(SAKHI_ID, undefined, caller(), AUTH_HEADER);

      expect(result.beneficiaries).toEqual([
        { beneficiaryId: BENEFICIARY_A, riskConditionSummaries: [] },
      ]);
      expect(resolveRiskGradesMock).not.toHaveBeenCalled();
    });

    it('worsening grade across 2 assessments for one beneficiary: baseline = earliest, latest = most recent, everHighest = the worse of the two', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A]);
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      repository.findAssessmentsWithFlagsForBeneficiaries.mockResolvedValue([
        assessment({
          id: 'assessment-2',
          evaluatedAt: new Date('2026-07-01'),
          riskFlags: [
            {
              ...assessment().riskFlags[0],
              riskConditionId: 'condition-1',
              riskGradeLookupValueId: 'grade-severe',
            },
          ],
        }),
        assessment({
          id: 'assessment-1',
          evaluatedAt: new Date('2026-06-01'),
          riskFlags: [
            {
              ...assessment().riskFlags[0],
              riskConditionId: 'condition-1',
              riskGradeLookupValueId: 'grade-mild',
            },
          ],
        }),
      ] as never);

      const result = await service.getRiskBySakhi(SAKHI_ID, undefined, caller(), AUTH_HEADER);

      expect(result.beneficiaries[0].riskConditionSummaries).toEqual([
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

    it('propagates a grade-lookup resolution failure rather than returning a partial response', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A]);
      repository.findAssessmentsWithFlagsForBeneficiaries.mockResolvedValue([
        assessment(),
      ] as never);
      resolveRiskGradesMock.mockRejectedValue(new Error('Unable to resolve RISK_GRADE.'));

      await expect(
        service.getRiskBySakhi(SAKHI_ID, undefined, caller(), AUTH_HEADER),
      ).rejects.toThrow('Unable to resolve RISK_GRADE.');
    });
  });

  describe('phase filtering', () => {
    function flagAtPhase(phase: string, overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: `flag-${phase}`,
        riskConditionId: `condition-${phase}`,
        riskGradeLookupValueId: 'grade-mild',
        observedValueJson: null,
        isReferralTrigger: false,
        isEducationTrigger: false,
        isHrVisitTrigger: false,
        riskCondition: { conditionCode: phase, conditionName: phase, phase },
        ...overrides,
      };
    }

    it('type=ANC includes only ANC-phase flags, excluding a PP-phase flag on the same beneficiary', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A]);
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      repository.findAssessmentsWithFlagsForBeneficiaries.mockResolvedValue([
        assessment({ riskFlags: [flagAtPhase('ANC'), flagAtPhase('PP')] }),
      ] as never);

      const result = await service.getRiskBySakhi(SAKHI_ID, 'ANC', caller(), AUTH_HEADER);

      expect(result.type).toBe('ANC');
      expect(result.beneficiaries[0].riskConditionSummaries.map((s) => s.phase)).toEqual(['ANC']);
    });

    it('type=PNC includes DELIVERY/PP/NN flags and excludes ANC/INC/CCV/REGISTRATION', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A]);
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      repository.findAssessmentsWithFlagsForBeneficiaries.mockResolvedValue([
        assessment({
          riskFlags: [
            flagAtPhase('ANC'),
            flagAtPhase('DELIVERY'),
            flagAtPhase('PP'),
            flagAtPhase('NN'),
            flagAtPhase('INC'),
            flagAtPhase('CCV'),
            flagAtPhase('REGISTRATION'),
          ],
        }),
      ] as never);

      const result = await service.getRiskBySakhi(SAKHI_ID, 'PNC', caller(), AUTH_HEADER);

      expect(result.type).toBe('PNC');
      expect(result.beneficiaries[0].riskConditionSummaries.map((s) => s.phase).sort()).toEqual([
        'DELIVERY',
        'NN',
        'PP',
      ]);
    });

    it('omitting type includes flags from every phase', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A]);
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      repository.findAssessmentsWithFlagsForBeneficiaries.mockResolvedValue([
        assessment({ riskFlags: [flagAtPhase('ANC'), flagAtPhase('CCV')] }),
      ] as never);

      const result = await service.getRiskBySakhi(SAKHI_ID, undefined, caller(), AUTH_HEADER);

      expect(result.type).toBeNull();
      expect(result.beneficiaries[0].riskConditionSummaries.map((s) => s.phase).sort()).toEqual([
        'ANC',
        'CCV',
      ]);
    });

    it('type=PNC filtering a beneficiary down to zero remaining flags still includes that beneficiary with an empty array', async () => {
      beneficiaryClient.getIds.mockResolvedValue([BENEFICIARY_A]);
      resolveRiskGradesMock.mockResolvedValue(GRADES);
      repository.findAssessmentsWithFlagsForBeneficiaries.mockResolvedValue([
        assessment({ riskFlags: [flagAtPhase('ANC')] }),
      ] as never);

      const result = await service.getRiskBySakhi(SAKHI_ID, 'PNC', caller(), AUTH_HEADER);

      expect(result.beneficiaries).toEqual([
        { beneficiaryId: BENEFICIARY_A, riskConditionSummaries: [] },
      ]);
    });
  });
});
