import { Test } from '@nestjs/testing';
import { ApprovalRequestRepository } from './approvalRequest.repository';
import { ApprovalRequestService } from './approvalRequest.service';

describe('ApprovalRequestService', () => {
  let service: ApprovalRequestService;
  const repository = { findMany: jest.fn(), create: jest.fn() };
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [ApprovalRequestService, { provide: ApprovalRequestRepository, useValue: repository }],
    }).compile();
    service = moduleRef.get(ApprovalRequestService);
  });
  it('lists via repository', async () => {
    repository.findMany.mockResolvedValue([]);
    await expect(service.list()).resolves.toEqual([]);
  });
});
