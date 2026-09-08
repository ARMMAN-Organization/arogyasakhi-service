import type { PrismaService } from '../prisma/prisma.service';
import type { AnalyticsEventInput } from './dto/create-analytics-event.dto';

/** Data access for analytics events. Owns only this service's `analyticsEvent` table. */
export class AnalyticsEventRepository {
  constructor(private readonly prisma: PrismaService) {}

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
