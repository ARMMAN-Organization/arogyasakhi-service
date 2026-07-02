import { Test } from '@nestjs/testing';
import { SyncBatchRepository } from './syncBatch.repository';
import { SyncBatchService } from './syncBatch.service';

describe('SyncBatchService', () => {
  let service: SyncBatchService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SyncBatchService, { provide: SyncBatchRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(SyncBatchService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
