import { MediaAssetService } from './mediaAsset.service';
import type { MediaAssetRepository } from './mediaAsset.repository';
import type { CreateMediaAssetInput } from './dto/create-mediaAsset.dto';

describe('MediaAssetService', () => {
  const repository = {
    findMany: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<MediaAssetRepository>;
  let service: MediaAssetService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new MediaAssetService(repository);
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
    const dto: CreateMediaAssetInput = { name: 'device-1' };
    const created = { id: '1', name: 'device-1', createdAt: new Date(), updatedAt: new Date() };
    repository.create.mockResolvedValue(created);
    await expect(service.create(dto)).resolves.toBe(created);
    expect(repository.create).toHaveBeenCalledWith(dto);
  });

  it('propagates repository errors on create', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    await expect(service.create({ name: 'x' })).rejects.toThrow('db down');
  });
});
