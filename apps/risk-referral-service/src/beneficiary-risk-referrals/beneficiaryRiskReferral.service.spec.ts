import type { AuthenticatedUser } from '@armman/service-commons';
import { BeneficiaryRiskReferralService } from './beneficiaryRiskReferral.service';
import type { BeneficiaryRiskReferralRepository } from './beneficiaryRiskReferral.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';

jest.mock('./sakhi.client');

const BENEFICIARY_ID = '11111111-1111-1111-1111-111111111111';
const REFERRAL_ID = '22222222-2222-2222-2222-222222222222';
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

function header(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REFERRAL_ID,
    beneficiaryId: BENEFICIARY_ID,
    visitId: null,
    referralTypeLookupValueId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    referralDate: new Date('2026-07-01'),
    facilityType: 'PHC',
    facilityName: 'Community PHC',
    status: 'PENDING_FOLLOWUP',
    validTill: null,
    supervisorApprovalStatus: 'NOT_REQUIRED',
    ...overrides,
  };
}

function detailsRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: REFERRAL_ID,
    referralFollowups: [
      {
        id: 'followup-1',
        followupDate: new Date('2026-07-05'),
        visitedFacilityFlag: true,
        notVisitedReason: null,
        diagnosis: 'Hypertension confirmed',
        treatmentGiven: 'Antihypertensive prescribed',
        outcome: 'Stabilized',
        casePaperMediaId: null,
        followupStatus: 'COMPLETED',
      },
    ],
    referralTriggerSources: [
      {
        id: 'trigger-1',
        riskFlagId: 'flag-1',
        riskConditionId: 'cond-1',
        sourceSubmissionId: 'submission-1',
        sourceFieldCode: 'systolicBp',
        triggerReason: 'Systolic BP above threshold',
      },
    ],
    ...overrides,
  };
}

describe('BeneficiaryRiskReferralService', () => {
  const repository = {
    findHeadersByBeneficiary: jest.fn(),
    findDetailsById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryRiskReferralRepository>;
  const beneficiaryClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const listSakhiIdsForSupervisorMock = jest.mocked(listSakhiIdsForSupervisor);
  let service: BeneficiaryRiskReferralService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new BeneficiaryRiskReferralService(repository, beneficiaryClient);
  });

  describe('listReferrals', () => {
    it('returns the header rows for the beneficiary', async () => {
      const rows = [header()];
      repository.findHeadersByBeneficiary.mockResolvedValue(rows as never);

      const result = await service.listReferrals(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result).toEqual(rows);
      expect(repository.findHeadersByBeneficiary).toHaveBeenCalledWith(BENEFICIARY_ID);
    });

    it('returns an empty array (not a 404) for a beneficiary with no referrals', async () => {
      repository.findHeadersByBeneficiary.mockResolvedValue([]);

      const result = await service.listReferrals(BENEFICIARY_ID, caller(), AUTH_HEADER);

      expect(result).toEqual([]);
    });

    it('403s when a SAKHI caller targets a beneficiary that is not her own', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'some-other-sakhi',
      } as never);

      await expect(
        service.listReferrals(BENEFICIARY_ID, caller({ id: 'sakhi-1', roles: ['SAKHI'] }), AUTH_HEADER),
      ).rejects.toThrow('You do not have access to this beneficiary.');
      expect(repository.findHeadersByBeneficiary).not.toHaveBeenCalled();
    });

    it('leaves a MANAGER/ADMIN caller unscoped, without calling beneficiary-service', async () => {
      repository.findHeadersByBeneficiary.mockResolvedValue([]);

      await service.listReferrals(BENEFICIARY_ID, caller({ roles: ['MANAGER'] }), AUTH_HEADER);

      expect(beneficiaryClient.getById).not.toHaveBeenCalled();
      expect(repository.findHeadersByBeneficiary).toHaveBeenCalledWith(BENEFICIARY_ID);
    });
  });

  describe('getReferralDetails', () => {
    it('returns followups + trigger sources for a referral owned by the beneficiary', async () => {
      repository.findDetailsById.mockResolvedValue(detailsRow() as never);

      const result = await service.getReferralDetails(
        BENEFICIARY_ID,
        REFERRAL_ID,
        caller(),
        AUTH_HEADER,
      );

      expect(result).toEqual({
        referralId: REFERRAL_ID,
        followups: detailsRow().referralFollowups,
        triggerSources: detailsRow().referralTriggerSources,
      });
      expect(repository.findDetailsById).toHaveBeenCalledWith(BENEFICIARY_ID, REFERRAL_ID);
    });

    it('returns empty followups/triggerSources arrays for a referral with neither', async () => {
      repository.findDetailsById.mockResolvedValue(
        detailsRow({ referralFollowups: [], referralTriggerSources: [] }) as never,
      );

      const result = await service.getReferralDetails(
        BENEFICIARY_ID,
        REFERRAL_ID,
        caller(),
        AUTH_HEADER,
      );

      expect(result).toEqual({ referralId: REFERRAL_ID, followups: [], triggerSources: [] });
    });

    it('404s when the referral does not exist', async () => {
      repository.findDetailsById.mockResolvedValue(null);

      await expect(
        service.getReferralDetails(BENEFICIARY_ID, REFERRAL_ID, caller(), AUTH_HEADER),
      ).rejects.toMatchObject({
        status: 404,
      });
    });

    it('404s when the referral exists but belongs to a different beneficiary (repository scopes both ids)', async () => {
      // The repository query scopes on both beneficiaryId + referralId together, so a
      // referral belonging to someone else surfaces as null here — same as not existing.
      repository.findDetailsById.mockResolvedValue(null);

      await expect(
        service.getReferralDetails('other-beneficiary', REFERRAL_ID, caller(), AUTH_HEADER),
      ).rejects.toThrow('Referral not found.');
      expect(repository.findDetailsById).toHaveBeenCalledWith('other-beneficiary', REFERRAL_ID);
    });

    it('403s when a SUPERVISOR caller\'s roster does not include the beneficiary\'s Sakhi', async () => {
      beneficiaryClient.getById.mockResolvedValue({
        id: BENEFICIARY_ID,
        sakhiId: 'some-other-sakhi',
      } as never);
      listSakhiIdsForSupervisorMock.mockResolvedValue(['sakhi-a']);

      await expect(
        service.getReferralDetails(
          BENEFICIARY_ID,
          REFERRAL_ID,
          caller({ id: 'supervisor-1', roles: ['SUPERVISOR'], projectId: 'project-1' }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow("This beneficiary is outside this Supervisor's roster.");
      expect(repository.findDetailsById).not.toHaveBeenCalled();
    });

    it('404s (Beneficiary not found) when beneficiary-service does not recognize the id', async () => {
      beneficiaryClient.getById.mockResolvedValue(null);

      await expect(
        service.getReferralDetails(
          BENEFICIARY_ID,
          REFERRAL_ID,
          caller({ id: 'sakhi-1', roles: ['SAKHI'] }),
          AUTH_HEADER,
        ),
      ).rejects.toThrow('Beneficiary not found.');
    });
  });
});
