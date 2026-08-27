import type { AuthenticatedUser } from '@armman/service-commons';
import { ReferralFollowupService } from './referralFollowup.service';
import type { ReferralFollowupRepository } from './referralFollowup.repository';
import type { ReferralRepository } from './referral.repository';
import type { BeneficiaryClient } from './beneficiary.client';
import type { CreateReferralFollowupInput } from './dto/create-referral-followup.dto';
import { mediaAssetExists } from './mediaAsset.client';

jest.mock('./mediaAsset.client');

const mediaAssetExistsMock = jest.mocked(mediaAssetExists);

const AUTH_HEADER = 'Bearer test-token';
const SAKHI_ID = '55555555-5555-5555-5555-555555555555';

function caller(overrides: Partial<AuthenticatedUser> = {}): AuthenticatedUser {
  return {
    id: SAKHI_ID,
    roles: ['SAKHI'],
    projectId: null,
    geographyUnitId: null,
    ...overrides,
  };
}

function referral(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    status: 'PENDING_FOLLOWUP' as const,
    isDeleted: false,
    ...overrides,
  };
}

function dto(overrides: Partial<CreateReferralFollowupInput> = {}): CreateReferralFollowupInput {
  return {
    visitedFacilityFlag: true,
    followupDate: new Date('2026-08-27'),
    mediaAssetIds: [],
    ...overrides,
  };
}

describe('ReferralFollowupService', () => {
  const referralRepository = {
    findById: jest.fn(),
  } as unknown as jest.Mocked<ReferralRepository>;
  const followupRepository = {
    create: jest.fn(),
  } as unknown as jest.Mocked<ReferralFollowupRepository>;
  const beneficiaryClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  let service: ReferralFollowupService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ReferralFollowupService(
      followupRepository,
      referralRepository,
      beneficiaryClient,
    );
  });

  it('404s when the referral does not exist', async () => {
    referralRepository.findById.mockResolvedValue(null);

    await expect(service.create('missing-id', dto(), caller(), AUTH_HEADER)).rejects.toMatchObject({
      status: 404,
    });
  });

  it("403s when the referral's beneficiary is not assigned to the calling SAKHI", async () => {
    referralRepository.findById.mockResolvedValue(referral() as never);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: 'someone-else' });

    await expect(service.create('ref-1', dto(), caller(), AUTH_HEADER)).rejects.toMatchObject({
      status: 403,
    });
    expect(followupRepository.create).not.toHaveBeenCalled();
  });

  it('409s when the referral is not PENDING_FOLLOWUP', async () => {
    referralRepository.findById.mockResolvedValue(referral({ status: 'COMPLETED' }) as never);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: SAKHI_ID });

    await expect(service.create('ref-1', dto(), caller(), AUTH_HEADER)).rejects.toMatchObject({
      status: 409,
    });
    expect(followupRepository.create).not.toHaveBeenCalled();
  });

  it('marks COMPLETED when visitedFacilityFlag is true', async () => {
    referralRepository.findById.mockResolvedValue(referral() as never);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: SAKHI_ID });
    followupRepository.create.mockResolvedValue({
      followup: { id: 'fu-1' },
      referral: referral({ status: 'COMPLETED' }),
    } as never);

    await service.create('ref-1', dto({ visitedFacilityFlag: true }), caller(), AUTH_HEADER);

    expect(followupRepository.create).toHaveBeenCalledWith(
      'ref-1',
      'COMPLETED',
      'COMPLETED',
      expect.objectContaining({ visitedFacilityFlag: true }),
      SAKHI_ID,
    );
  });

  it('marks INCOMPLETE and leaves the referral PENDING_FOLLOWUP when visitedFacilityFlag is false', async () => {
    referralRepository.findById.mockResolvedValue(referral() as never);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: SAKHI_ID });
    followupRepository.create.mockResolvedValue({
      followup: { id: 'fu-1' },
      referral: referral(),
    } as never);

    await service.create(
      'ref-1',
      dto({ visitedFacilityFlag: false, notVisitedReason: 'facility closed' }),
      caller(),
      AUTH_HEADER,
    );

    expect(followupRepository.create).toHaveBeenCalledWith(
      'ref-1',
      'INCOMPLETE',
      'PENDING_FOLLOWUP',
      expect.objectContaining({ visitedFacilityFlag: false }),
      SAKHI_ID,
    );
  });

  it('accepts a follow-up with multiple valid media asset ids', async () => {
    referralRepository.findById.mockResolvedValue(referral() as never);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: SAKHI_ID });
    mediaAssetExistsMock.mockResolvedValue(true);
    followupRepository.create.mockResolvedValue({
      followup: { id: 'fu-1' },
      referral: referral({ status: 'COMPLETED' }),
    } as never);

    const mediaAssetIds = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
    ];
    const result = await service.create(
      'ref-1',
      dto({ visitedFacilityFlag: true, mediaAssetIds }),
      caller(),
      AUTH_HEADER,
    );

    expect(mediaAssetExistsMock).toHaveBeenCalledTimes(2);
    expect(mediaAssetExistsMock).toHaveBeenCalledWith(mediaAssetIds[0], AUTH_HEADER);
    expect(mediaAssetExistsMock).toHaveBeenCalledWith(mediaAssetIds[1], AUTH_HEADER);
    expect(result.mediaAssetIds).toEqual(mediaAssetIds);
  });

  it('422s naming the specific media asset id that does not exist', async () => {
    referralRepository.findById.mockResolvedValue(referral() as never);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: SAKHI_ID });
    mediaAssetExistsMock.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    const badId = '99999999-9999-9999-9999-999999999999';
    await expect(
      service.create(
        'ref-1',
        dto({
          visitedFacilityFlag: true,
          mediaAssetIds: ['11111111-1111-1111-1111-111111111111', badId],
        }),
        caller(),
        AUTH_HEADER,
      ),
    ).rejects.toMatchObject({ status: 422, message: expect.stringContaining(badId) });
    expect(followupRepository.create).not.toHaveBeenCalled();
  });

  it('defaults to an empty media list when none are submitted', async () => {
    referralRepository.findById.mockResolvedValue(referral() as never);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: SAKHI_ID });
    followupRepository.create.mockResolvedValue({
      followup: { id: 'fu-1' },
      referral: referral({ status: 'COMPLETED' }),
    } as never);

    const result = await service.create(
      'ref-1',
      dto({ visitedFacilityFlag: true }),
      caller(),
      AUTH_HEADER,
    );

    expect(mediaAssetExistsMock).not.toHaveBeenCalled();
    expect(result.mediaAssetIds).toEqual([]);
  });
});
