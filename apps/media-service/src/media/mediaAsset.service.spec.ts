import { Test } from '@nestjs/testing';
import { MediaAssetRepository } from './mediaAsset.repository';
import { MediaAssetService } from './mediaAsset.service';

describe('MediaAssetService', () => {
  let service: MediaAssetService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [MediaAssetService, { provide: MediaAssetRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(MediaAssetService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
