import { Test } from '@nestjs/testing';
import { ReferralRepository } from './referral.repository';
import { ReferralService } from './referral.service';

describe('ReferralService', () => {
  let service: ReferralService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ReferralService, { provide: ReferralRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(ReferralService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
