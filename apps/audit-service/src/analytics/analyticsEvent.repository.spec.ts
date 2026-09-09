import { AnalyticsEventRepository } from './analyticsEvent.repository';

describe('AnalyticsEventRepository', () => {
  const findMany = jest.fn();
  const findFirst = jest.fn();
  const create = jest.fn();
  const prisma = { analyticsEvent: { findMany, findFirst, create } } as never;
  let repository: AnalyticsEventRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new AnalyticsEventRepository(prisma);
  });

  describe('findByFeatureAreaAndWindow', () => {
    const since = new Date('2026-09-01T00:00:00.000Z');
    const until = new Date('2026-09-02T00:00:00.000Z');

    it('scopes the query to featureArea and the [since, until) window', async () => {
      findMany.mockResolvedValue([]);

      await repository.findByFeatureAreaAndWindow('ENROLLMENT', since, until, 10, undefined);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { featureArea: 'ENROLLMENT', occurredAt: { gte: since, lt: until } },
        }),
      );
    });

    it('returns nextCursor null when fewer rows than the limit come back', async () => {
      findMany.mockResolvedValue([
        {
          id: 'event-1',
          sakhiUserId: 'sakhi-1',
          eventName: 'FORM_SUBMIT',
          occurredAt: new Date('2026-09-01T10:00:00.000Z'),
          payloadJson: null,
        },
      ]);

      const result = await repository.findByFeatureAreaAndWindow(
        'ENROLLMENT',
        since,
        until,
        10,
        undefined,
      );

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeNull();
    });

    it('trims the extra row and returns an opaque nextCursor when there are more rows than the limit', async () => {
      const rows = Array.from({ length: 3 }, (_, i) => ({
        id: `event-${i}`,
        sakhiUserId: 'sakhi-1',
        eventName: 'FORM_SUBMIT',
        occurredAt: new Date(`2026-09-01T10:0${i}:00.000Z`),
        payloadJson: null,
      }));
      findMany.mockResolvedValue(rows);

      const result = await repository.findByFeatureAreaAndWindow(
        'ENROLLMENT',
        since,
        until,
        2,
        undefined,
      );

      expect(result.items).toHaveLength(2);
      expect(result.nextCursor).not.toBeNull();
      expect(typeof result.nextCursor).toBe('string');
    });

    it('decodes a valid cursor into an occurredAt/id filter', async () => {
      findMany.mockResolvedValue([]);
      const cursor = Buffer.from(
        JSON.stringify({ occurredAt: '2026-09-01T10:00:00.000Z', id: 'event-1' }),
      ).toString('base64url');

      await repository.findByFeatureAreaAndWindow('ENROLLMENT', since, until, 10, cursor);

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            OR: [
              { occurredAt: { gt: new Date('2026-09-01T10:00:00.000Z') } },
              { occurredAt: new Date('2026-09-01T10:00:00.000Z'), id: { gt: 'event-1' } },
            ],
          }),
        }),
      );
    });

    it('treats a malformed cursor as "start from the beginning" rather than throwing', async () => {
      findMany.mockResolvedValue([]);

      await expect(
        repository.findByFeatureAreaAndWindow('ENROLLMENT', since, until, 10, 'not-a-valid-cursor'),
      ).resolves.not.toThrow();
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { featureArea: 'ENROLLMENT', occurredAt: { gte: since, lt: until } },
        }),
      );
    });
  });

  describe('findByLocalEventUuid', () => {
    it('looks up by localEventUuid', async () => {
      findFirst.mockResolvedValue(null);
      await repository.findByLocalEventUuid('uuid-1');
      expect(findFirst).toHaveBeenCalledWith({ where: { localEventUuid: 'uuid-1' } });
    });
  });

  describe('create', () => {
    it('persists the event with the given sakhiUserId/deviceId', async () => {
      create.mockResolvedValue({});
      await repository.create('sakhi-1', 'device-1', {
        featureArea: 'ENROLLMENT',
        eventName: 'FORM_SUBMIT',
        occurredAt: '2026-09-08T10:15:00.000Z',
        localEventUuid: 'uuid-1',
      });

      expect(create).toHaveBeenCalledWith({
        data: {
          sakhiUserId: 'sakhi-1',
          deviceId: 'device-1',
          featureArea: 'ENROLLMENT',
          eventName: 'FORM_SUBMIT',
          occurredAt: new Date('2026-09-08T10:15:00.000Z'),
          payloadJson: undefined,
          localEventUuid: 'uuid-1',
        },
      });
    });
  });
});
