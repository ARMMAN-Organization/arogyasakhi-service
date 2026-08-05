import { ReopenRequestService } from './reopen-request.service';
import type { ReopenRequestRepository } from './reopen-request.repository';
import type { DecideReopenRequestInput } from './dto/decide-reopen-request.dto';

function reopenRequest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    requestReason: 'CLOSED_BY_MISTAKE' as const,
    requestedByUserId: '33333333-3333-3333-3333-333333333333',
    requestedAt: new Date('2026-08-01'),
    supervisorStatus: 'PENDING' as const,
    decisionReasonCodeLookupId: null,
    decisionNotes: null,
    decidedByUserId: null,
    decidedAt: null,
    createdAt: new Date('2026-08-01'),
    createdByUserId: null,
    updatedAt: new Date('2026-08-01'),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
    ...overrides,
  };
}

describe('ReopenRequestService', () => {
  const repository = {
    findById: jest.fn(),
    decide: jest.fn(),
  } as unknown as jest.Mocked<ReopenRequestRepository>;
  let service: ReopenRequestService;
  const supervisorId = '44444444-4444-4444-4444-444444444444';

  beforeEach(() => {
    jest.resetAllMocks();
    service = new ReopenRequestService(repository);
  });

  it('approves a PENDING reopen request', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'APPROVED', decidedByUserId: supervisorId });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);

    const dto: DecideReopenRequestInput = { decision: 'APPROVED' };
    await expect(service.decide(pending.id, supervisorId, dto)).resolves.toBe(decided);
    expect(repository.decide).toHaveBeenCalledWith(pending.id, supervisorId, dto);
  });

  it('rejects a PENDING reopen request — persisted as the "Cannot re-open" state', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'REJECTED', decidedByUserId: supervisorId });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);

    const dto: DecideReopenRequestInput = { decision: 'REJECTED' };
    const result = await service.decide(pending.id, supervisorId, dto);
    expect(result?.supervisorStatus).toBe('REJECTED');
  });

  it('404s on an unknown id', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(
      service.decide('unknown-id', supervisorId, { decision: 'APPROVED' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(repository.decide).not.toHaveBeenCalled();
  });

  it('409s on an already-APPROVED reopen request', async () => {
    repository.findById.mockResolvedValue(reopenRequest({ supervisorStatus: 'APPROVED' }));
    await expect(
      service.decide('11111111-1111-1111-1111-111111111111', supervisorId, {
        decision: 'REJECTED',
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(repository.decide).not.toHaveBeenCalled();
  });

  it('409s on an already-REJECTED reopen request', async () => {
    repository.findById.mockResolvedValue(reopenRequest({ supervisorStatus: 'REJECTED' }));
    await expect(
      service.decide('11111111-1111-1111-1111-111111111111', supervisorId, {
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('409s when the conditional update races with a concurrent decision', async () => {
    repository.findById.mockResolvedValueOnce(reopenRequest());
    repository.decide.mockResolvedValue(false);
    await expect(
      service.decide('11111111-1111-1111-1111-111111111111', supervisorId, {
        decision: 'APPROVED',
      }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it('succeeds with no decisionReasonCodeLookupId/decisionNotes (both optional)', async () => {
    const pending = reopenRequest();
    const decided = reopenRequest({ supervisorStatus: 'APPROVED' });
    repository.findById.mockResolvedValueOnce(pending).mockResolvedValueOnce(decided);
    repository.decide.mockResolvedValue(true);

    await expect(service.decide(pending.id, supervisorId, { decision: 'APPROVED' })).resolves.toBe(
      decided,
    );
  });
});
