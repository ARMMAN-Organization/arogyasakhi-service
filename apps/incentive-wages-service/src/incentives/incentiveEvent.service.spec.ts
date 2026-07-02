import { Test } from '@nestjs/testing';
import { IncentiveEventRepository } from './incentiveEvent.repository';
import { IncentiveEventService } from './incentiveEvent.service';

describe('IncentiveEventService', () => {
  let service: IncentiveEventService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [IncentiveEventService, { provide: IncentiveEventRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(IncentiveEventService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
