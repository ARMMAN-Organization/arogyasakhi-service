import { AnalyticsEventService } from './analyticsEvent.service';
import type { AnalyticsEventRepository } from './analyticsEvent.repository';
import type {
  AnalyticsEventInput,
  CreateAnalyticsEventBatchInput,
} from './dto/create-analytics-event.dto';

/** Mimics Prisma's P2002 unique-constraint-violation error shape. */
function uniqueConstraintError(): unknown {
  return { code: 'P2002', meta: { target: ['local_event_uuid'] } };
}

function event(overrides: Partial<AnalyticsEventInput> = {}): AnalyticsEventInput {
  return {
    featureArea: 'ENROLLMENT',
    eventName: 'FORM_SUBMIT',
    occurredAt: '2026-09-08T10:15:00.000Z',
    localEventUuid: 'event-uuid-1',
    ...overrides,
  };
}

describe('AnalyticsEventService', () => {
  const repository = {
    findByLocalEventUuid: jest.fn(),
    create: jest.fn(),
  } as unknown as jest.Mocked<AnalyticsEventRepository>;
  let service: AnalyticsEventService;

  const SAKHI_ID = 'sakhi-1';

  beforeEach(() => {
    jest.resetAllMocks();
    repository.findByLocalEventUuid.mockResolvedValue(null);
    service = new AnalyticsEventService(repository);
  });

  it('persists every event in a valid batch, reporting created count and no failures', async () => {
    repository.create.mockResolvedValue({} as never);
    const dto: CreateAnalyticsEventBatchInput = {
      events: [event({ localEventUuid: 'uuid-1' }), event({ localEventUuid: 'uuid-2' })],
    };

    const result = await service.createBatch(SAKHI_ID, dto);

    expect(result).toEqual({ created: 2, failed: [] });
    expect(repository.create).toHaveBeenCalledTimes(2);
  });

  it('treats a resubmission of the same localEventUuid (matching fields) as an idempotent replay, not a duplicate', async () => {
    const existing = {
      id: 'existing-1',
      featureArea: 'ENROLLMENT',
      eventName: 'FORM_SUBMIT',
      occurredAt: new Date('2026-09-08T10:15:00.000Z'),
    };
    repository.findByLocalEventUuid.mockResolvedValue(existing as never);
    const dto: CreateAnalyticsEventBatchInput = { events: [event({ localEventUuid: 'uuid-1' })] };

    const result = await service.createBatch(SAKHI_ID, dto);

    expect(result).toEqual({ created: 1, failed: [] });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('fails just that one event when localEventUuid collides with a different logical event', async () => {
    const existing = {
      id: 'existing-1',
      featureArea: 'REFERRAL',
      eventName: 'REFERRAL_SUBMIT',
      occurredAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    repository.findByLocalEventUuid
      .mockResolvedValueOnce(existing as never) // event 1: collides with an unrelated existing event
      .mockResolvedValueOnce(null); // event 2: no prior event with this uuid
    repository.create.mockResolvedValue({} as never);
    const dto: CreateAnalyticsEventBatchInput = {
      events: [event({ localEventUuid: 'uuid-1' }), event({ localEventUuid: 'uuid-2' })],
    };

    const result = await service.createBatch(SAKHI_ID, dto);

    expect(result.created).toBe(1);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]).toMatchObject({ index: 0, localEventUuid: 'uuid-1' });
    // The second, unrelated event still persists — one bad event doesn't
    // block the rest of the batch.
    expect(repository.create).toHaveBeenCalledTimes(1);
  });

  it('resolves a concurrent-retry race (create() throws P2002) the same way as a sequential retry', async () => {
    repository.create.mockRejectedValueOnce(uniqueConstraintError());
    const winner = {
      id: 'winner-1',
      featureArea: 'ENROLLMENT',
      eventName: 'FORM_SUBMIT',
      occurredAt: new Date('2026-09-08T10:15:00.000Z'),
    };
    repository.findByLocalEventUuid
      .mockResolvedValueOnce(null) // pre-check: not found yet
      .mockResolvedValueOnce(winner as never); // post-P2002: the concurrent winner
    const dto: CreateAnalyticsEventBatchInput = { events: [event({ localEventUuid: 'uuid-1' })] };

    const result = await service.createBatch(SAKHI_ID, dto);

    expect(result).toEqual({ created: 1, failed: [] });
  });

  it('fails the event when a concurrent-retry race resolves to a different logical event', async () => {
    repository.create.mockRejectedValueOnce(uniqueConstraintError());
    const winner = {
      id: 'winner-1',
      featureArea: 'REFERRAL',
      eventName: 'REFERRAL_SUBMIT',
      occurredAt: new Date('2020-01-01T00:00:00.000Z'),
    };
    repository.findByLocalEventUuid
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner as never);
    const dto: CreateAnalyticsEventBatchInput = { events: [event({ localEventUuid: 'uuid-1' })] };

    const result = await service.createBatch(SAKHI_ID, dto);

    expect(result.created).toBe(0);
    expect(result.failed).toHaveLength(1);
  });

  it('propagates a non-P2002 repository error as a per-event failure, not a thrown exception', async () => {
    repository.create.mockRejectedValue(new Error('db down'));
    const dto: CreateAnalyticsEventBatchInput = { events: [event({ localEventUuid: 'uuid-1' })] };

    const result = await service.createBatch(SAKHI_ID, dto);

    expect(result.created).toBe(0);
    expect(result.failed).toEqual([{ index: 0, localEventUuid: 'uuid-1', message: 'db down' }]);
  });

  it('persists an event with no localEventUuid without an idempotency lookup', async () => {
    repository.create.mockResolvedValue({} as never);
    const dto: CreateAnalyticsEventBatchInput = {
      events: [event({ localEventUuid: undefined })],
    };

    const result = await service.createBatch(SAKHI_ID, dto);

    expect(result).toEqual({ created: 1, failed: [] });
    expect(repository.findByLocalEventUuid).not.toHaveBeenCalled();
  });
});
