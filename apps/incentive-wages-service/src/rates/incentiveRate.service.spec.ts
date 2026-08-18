import { IncentiveRateService } from './incentiveRate.service';
import type { IncentiveRateRepository } from './incentiveRate.repository';

describe('IncentiveRateService', () => {
  const repository = {
    findActiveRate: jest.fn(),
    findAll: jest.fn(),
  } as unknown as jest.Mocked<IncentiveRateRepository>;
  let service: IncentiveRateService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new IncentiveRateService(repository);
  });

  describe('findAll', () => {
    it('returns every rate from the repository', async () => {
      const rates = [{ id: 'rate-1' }, { id: 'rate-2' }];
      repository.findAll.mockResolvedValue(rates as never);
      await expect(service.findAll()).resolves.toBe(rates);
    });

    it('returns an empty list when no rates exist', async () => {
      repository.findAll.mockResolvedValue([]);
      await expect(service.findAll()).resolves.toEqual([]);
    });
  });

  it('resolves via repository with the given query', async () => {
    const rate = { id: 'rate-1', amountInr: 100 };
    repository.findActiveRate.mockResolvedValue(rate as never);

    const result = await service.findActive({
      rateType: 'REFERRAL',
      referralType: 'ACCOMPANIED',
      geographyUnitId: undefined,
      asOf: new Date('2026-08-07'),
    });

    expect(result).toBe(rate);
    expect(repository.findActiveRate).toHaveBeenCalledWith(
      'REFERRAL',
      'ACCOMPANIED',
      undefined,
      new Date('2026-08-07'),
    );
  });

  it('defaults asOf to now when not supplied', async () => {
    repository.findActiveRate.mockResolvedValue(null);

    await service.findActive({ rateType: 'REFERRAL' });

    expect(repository.findActiveRate).toHaveBeenCalledWith(
      'REFERRAL',
      undefined,
      undefined,
      expect.any(Date),
    );
  });

  it('returns null when no active rate is found', async () => {
    repository.findActiveRate.mockResolvedValue(null);
    await expect(service.findActive({ rateType: 'REFERRAL' })).resolves.toBeNull();
  });
});
