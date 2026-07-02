import { Test } from '@nestjs/testing';
import { SessionRepository } from './session.repository';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [SessionService, { provide: SessionRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(SessionService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
