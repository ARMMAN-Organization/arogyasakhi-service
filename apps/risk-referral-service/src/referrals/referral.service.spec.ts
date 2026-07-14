import { ReferralService } from './referral.service';
import type { ReferralRepository } from './referral.repository';
import type { CreateReferralInput } from './dto/create-referral.dto';

describe('ReferralService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<ReferralRepository>;
  let service: ReferralService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ReferralService(repository);
  });

  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });

  it('returns the repository list unchanged', async () => {
    const rows = [{ id: '1', name: 'a', createdAt: new Date(), updatedAt: new Date() }];
    repository.findMany.mockResolvedValue(rows);
    await expect(service.list()).resolves.toBe(rows);
  });

  it('creates via repository with the given data', async () => {
    const dto: CreateReferralInput = { name: 'referral-1' };
    const created = { id: '1', name: 'referral-1', createdAt: new Date(), updatedAt: new Date() };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create({ name: 'x' })).rejects.toThrow('db down');
  });
});
