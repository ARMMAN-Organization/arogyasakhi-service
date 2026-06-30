import { Test } from '@nestjs/testing';
import { RuleSetRepository } from './ruleSet.repository';
import { RuleSetService } from './ruleSet.service';

describe('RuleSetService', () => {
  let service: RuleSetService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [RuleSetService, { provide: RuleSetRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(RuleSetService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
