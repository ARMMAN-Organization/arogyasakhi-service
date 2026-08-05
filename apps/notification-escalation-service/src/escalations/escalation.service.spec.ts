import { EscalationService } from './escalation.service';
import type { EscalationRepository } from './escalation.repository';
import type { ListEscalationEventsInput } from './dto/list-escalation-events.dto';
import type { EscalationType } from '../../../../node_modules/.prisma/client-notification-escalation-service';

function row(overrides: { id?: string; escalationType?: EscalationType; createdAt?: Date } = {}) {
  return {
    id: overrides.id ?? '11111111-1111-1111-1111-111111111111',
    beneficiaryId: '22222222-2222-2222-2222-222222222222',
    visitId: null,
    referralId: null,
    escalationType: overrides.escalationType ?? ('ANC_2_MISSED' as const),
    triggerRuleVersionId: null,
    status: 'OPEN' as const,
    assignedSupervisorId: null,
    resolvedAt: null,
    actionTaken: null,
    createdAt: overrides.createdAt ?? new Date('2026-08-05T10:00:00.000Z'),
    createdByUserId: null,
    updatedAt: overrides.createdAt ?? new Date('2026-08-05T10:00:00.000Z'),
    updatedByUserId: null,
    isDeleted: false,
    deletedAt: null,
  };
}

describe('EscalationService', () => {
  const repository = { findMany: jest.fn() } as unknown as jest.Mocked<EscalationRepository>;
  let service: EscalationService;
  const baseQuery: ListEscalationEventsInput = { status: 'OPEN', limit: 50 };

  beforeEach(() => {
    jest.resetAllMocks();
    service = new EscalationService(repository);
  });

  it('groups every *_MISSED escalation type under MISSED_VISIT', async () => {
    repository.findMany.mockResolvedValue([row({ escalationType: 'PP_HR_MISSED' })]);
    const result = await service.list(baseQuery);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].cardType).toBe('MISSED_VISIT');
    expect(result.cards[0].cardSource).toBe('escalation_events');
  });

  it('surfaces EDD_NEARING as its own card type', async () => {
    repository.findMany.mockResolvedValue([row({ escalationType: 'EDD_NEARING' })]);
    const result = await service.list(baseQuery);
    expect(result.cards[0].cardType).toBe('EDD_NEARING');
  });

  it('omits escalation types outside the 8 supported Quick Response card types', async () => {
    repository.findMany.mockResolvedValue([row({ escalationType: 'SYNC_DELAY' })]);
    const result = await service.list(baseQuery);
    expect(result.cards).toHaveLength(0);
  });

  it('returns no nextCursor when the repository returns exactly `limit` rows', async () => {
    repository.findMany.mockResolvedValue([row()]);
    const result = await service.list({ ...baseQuery, limit: 1 });
    expect(result.nextCursor).toBeNull();
  });

  it('returns a nextCursor and trims to `limit` when more rows exist', async () => {
    const rows = [
      row({ id: 'a', createdAt: new Date('2026-08-05T10:00:02.000Z') }),
      row({ id: 'b', createdAt: new Date('2026-08-05T10:00:01.000Z') }),
    ];
    repository.findMany.mockResolvedValue(rows);
    const result = await service.list({ ...baseQuery, limit: 1 });
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].cardId).toBe('a');
    expect(result.nextCursor).not.toBeNull();
  });

  it('decodes a previously issued cursor back into a repository filter', async () => {
    repository.findMany.mockResolvedValue([]);
    const cursor = Buffer.from(
      '2026-08-05T10:00:00.000Z|11111111-1111-1111-1111-111111111111',
    ).toString('base64url');
    await service.list({ ...baseQuery, cursor });
    expect(repository.findMany).toHaveBeenCalledWith(
      { ...baseQuery, cursor },
      {
        createdAt: new Date('2026-08-05T10:00:00.000Z'),
        id: '11111111-1111-1111-1111-111111111111',
      },
    );
  });

  it('rejects a malformed cursor with a 400', async () => {
    await expect(
      service.list({ ...baseQuery, cursor: 'not-valid-base64!!' }),
    ).rejects.toMatchObject({
      status: 400,
    });
    expect(repository.findMany).not.toHaveBeenCalled();
  });
});
