import type { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsEventInput } from './dto/create-analytics-event.dto';

/** Encodes a row's (occurredAt, id) pair as an opaque pagination cursor —
 * same convention as beneficiary.repository.ts's own encodeCursor. */
function encodeCursor(row: { occurredAt: Date; id: string }): string {
  return Buffer.from(
    JSON.stringify({ occurredAt: row.occurredAt.toISOString(), id: row.id }),
  ).toString('base64url');
}

/** Decodes a cursor produced by encodeCursor; returns null on any malformed input. */
function decodeCursor(cursor: string): { occurredAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.occurredAt === 'string' && typeof parsed?.id === 'string') {
      return parsed as { occurredAt: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}

/** Data access for analytics events. Owns only this service's `analyticsEvent` table. */
export class AnalyticsEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated read for reporting-etl-service's metric-aggregation
   * job (SRS Sec 9.9's ETL step) — a half-open [since, until) window,
   * scoped to one feature area at a time so the job can process each area
   * independently. Unscoped by Sakhi (unlike every human-facing endpoint):
   * the aggregation is across all Sakhis for the period, not one caller's
   * own data.
   */
  async findByFeatureAreaAndWindow(
    featureArea: string,
    since: Date,
    until: Date,
    limit: number,
    cursor: string | undefined,
  ): Promise<{
    items: {
      id: string;
      sakhiUserId: string | null;
      eventName: string;
      occurredAt: Date;
      payloadJson: unknown;
    }[];
    nextCursor: string | null;
  }> {
    const decodedCursor = cursor ? decodeCursor(cursor) : null;

    const rows = await this.prisma.analyticsEvent.findMany({
      where: {
        featureArea,
        occurredAt: { gte: since, lt: until },
        ...(decodedCursor
          ? {
              OR: [
                { occurredAt: { gt: new Date(decodedCursor.occurredAt) } },
                { occurredAt: new Date(decodedCursor.occurredAt), id: { gt: decodedCursor.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ occurredAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
      select: { id: true, sakhiUserId: true, eventName: true, occurredAt: true, payloadJson: true },
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const lastItem = items[items.length - 1];
    return { items, nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null };
  }

  /**
   * Finds an event previously created from this exact client-generated
   * localEventUuid — lets the service treat a dropped-connection retry of a
   * batch upload as an idempotent replay of that one event, instead of a
   * duplicate row.
   */
  findByLocalEventUuid(localEventUuid: string) {
    return this.prisma.analyticsEvent.findFirst({ where: { localEventUuid } });
  }

  create(sakhiUserId: string | null, deviceId: string | null, data: AnalyticsEventInput) {
    return this.prisma.analyticsEvent.create({
      data: {
        sakhiUserId,
        deviceId,
        featureArea: data.featureArea,
        eventName: data.eventName,
        occurredAt: new Date(data.occurredAt),
        payloadJson: data.payloadJson,
        localEventUuid: data.localEventUuid,
      },
    });
  }
}
