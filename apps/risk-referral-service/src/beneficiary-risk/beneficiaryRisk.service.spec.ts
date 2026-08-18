import type { AuthenticatedUser } from '@armman/service-commons';
import { BeneficiaryRiskService } from './beneficiaryRisk.service';
import type { BeneficiaryRiskRepository } from './beneficiaryRisk.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';

jest.mock('./sakhi.client');

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
        service.getRiskProfile(BENEFICIARY_ID, caller({ id: 'sakhi-1', roles: ['SAKHI'] }), AUTH_HEADER),
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
        service.getRiskProfile(BENEFICIARY_ID, caller({ id: 'sakhi-1', roles: ['SAKHI'] }), AUTH_HEADER),
      ).rejects.toThrow('Beneficiary not found.');
      expect(repository.findStateSnapshots).not.toHaveBeenCalled();
    });
  });
});
