import type { AuthenticatedUser } from '@armman/service-commons';
import { ReferralConversionService } from './referralConversion.service';
import type { ReferralRepository } from './referral.repository';
import type { BeneficiaryClient } from './beneficiary.client';
import { resolveReferralTypeLookupId } from './lookup.client';

jest.mock('./lookup.client');

const AUTH_HEADER = 'Bearer test-token';
const SAKHI_ID = '55555555-5555-5555-5555-555555555555';
const STANDARD_LOOKUP_ID = 'lookup-standard';
const ACCOMPANIED_LOOKUP_ID = 'lookup-accompanied';

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
    referralTypeLookupValueId: STANDARD_LOOKUP_ID,
    validTill: new Date('2026-09-01T00:00:00.000Z'),
    isDeleted: false,
    ...overrides,
  };
}

describe('ReferralConversionService', () => {
  const referralRepository = {
    findById: jest.fn(),
    updateType: jest.fn(),
  } as unknown as jest.Mocked<ReferralRepository>;
  const beneficiaryClient = {
    getById: jest.fn(),
  } as unknown as jest.Mocked<BeneficiaryClient>;
  const resolveReferralTypeLookupIdMock = jest.mocked(resolveReferralTypeLookupId);
  let service: ReferralConversionService;

  beforeEach(() => {
    jest.resetAllMocks();
    resolveReferralTypeLookupIdMock.mockResolvedValue(ACCOMPANIED_LOOKUP_ID);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: SAKHI_ID });
    service = new ReferralConversionService(referralRepository, beneficiaryClient);
  });

  it('404s when the referral does not exist', async () => {
    referralRepository.findById.mockResolvedValue(null);

    await expect(
      service.convertToAccompanied('missing-id', caller(), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("403s when the referral's beneficiary is not assigned to the calling SAKHI", async () => {
    referralRepository.findById.mockResolvedValue(referral() as never);
    beneficiaryClient.getById.mockResolvedValue({ id: 'ben-1', sakhiId: 'someone-else' });

    await expect(
      service.convertToAccompanied('ref-1', caller(), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 403 });
    expect(referralRepository.updateType).not.toHaveBeenCalled();
  });

  it('409s when the referral is not PENDING_FOLLOWUP', async () => {
    referralRepository.findById.mockResolvedValue(referral({ status: 'COMPLETED' }) as never);

    await expect(
      service.convertToAccompanied('ref-1', caller(), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 409 });
    expect(referralRepository.updateType).not.toHaveBeenCalled();
  });

  it('409s when already Accompanied', async () => {
    referralRepository.findById.mockResolvedValue(
      referral({ referralTypeLookupValueId: ACCOMPANIED_LOOKUP_ID }) as never,
    );

    await expect(
      service.convertToAccompanied('ref-1', caller(), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 409 });
    expect(referralRepository.updateType).not.toHaveBeenCalled();
  });

  it('409s when now is past validTill — no conversion after the 7-day window closes', async () => {
    referralRepository.findById.mockResolvedValue(
      referral({ validTill: new Date('2020-01-01T00:00:00.000Z') }) as never,
    );

    await expect(
      service.convertToAccompanied('ref-1', caller(), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 409 });
    expect(referralRepository.updateType).not.toHaveBeenCalled();
  });

  it('502s if the ACCOMPANIED lookup value cannot be resolved (fails closed)', async () => {
    referralRepository.findById.mockResolvedValue(referral() as never);
    resolveReferralTypeLookupIdMock.mockResolvedValue(null);

    await expect(
      service.convertToAccompanied('ref-1', caller(), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 502 });
    expect(referralRepository.updateType).not.toHaveBeenCalled();
  });

  it('converts a Standard referral within the window to Accompanied', async () => {
    const pending = referral();
    const converted = referral({ referralTypeLookupValueId: ACCOMPANIED_LOOKUP_ID });
    referralRepository.findById
      .mockResolvedValueOnce(pending as never)
      .mockResolvedValueOnce(converted as never);
    referralRepository.updateType.mockResolvedValue(true);

    const result = await service.convertToAccompanied('ref-1', caller(), AUTH_HEADER);

    expect(referralRepository.updateType).toHaveBeenCalledWith(
      'ref-1',
      STANDARD_LOOKUP_ID,
      ACCOMPANIED_LOOKUP_ID,
    );
    expect(result).toEqual(converted);
  });

  it('409s when the conditional update races with a concurrent decision/conversion', async () => {
    referralRepository.findById.mockResolvedValueOnce(referral() as never);
    referralRepository.updateType.mockResolvedValue(false);

    await expect(
      service.convertToAccompanied('ref-1', caller(), AUTH_HEADER),
    ).rejects.toMatchObject({ status: 409 });
  });
});
