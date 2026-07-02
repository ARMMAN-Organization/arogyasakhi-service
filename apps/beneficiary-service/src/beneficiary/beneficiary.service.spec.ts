import { Test } from '@nestjs/testing';

import { BeneficiaryRepository } from './beneficiary.repository';
import { BeneficiaryService } from './beneficiary.service';

describe('BeneficiaryService', () => {
  let service: BeneficiaryService;
  const repository = { findMany: jest.fn(), create: jest.fn() };

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [BeneficiaryService, { provide: BeneficiaryRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(BeneficiaryService);
  });

  it('lists beneficiaries via the repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
    expect(repository.findMany).toHaveBeenCalledTimes(1);
  });
});
