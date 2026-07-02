import { Test } from '@nestjs/testing';
import { ClosureRepository } from './closure.repository';
import { ClosureService } from './closure.service';

describe('ClosureService', () => {
  let service: ClosureService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ClosureService, { provide: ClosureRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(ClosureService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
