import { Test } from '@nestjs/testing';
import { VisitInstanceRepository } from './visitInstance.repository';
import { VisitInstanceService } from './visitInstance.service';

describe('VisitInstanceService', () => {
  let service: VisitInstanceService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [VisitInstanceService, { provide: VisitInstanceRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(VisitInstanceService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
