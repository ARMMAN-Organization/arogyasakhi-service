import type { PrismaService } from '../prisma/prisma.service';
import type { CreateIncentiveEventInput } from './dto/create-incentiveEvent.dto';

/** Data access for incentive events. Owns only this service's `incentive_events` table. */
export class IncentiveEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.incentiveEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  /**
   * `amountInr` is not part of `CreateIncentiveEventInput` — it's resolved
   * server-side by the service from the referenced rate, never trusted from
   * the client (see createIncentiveEventSchema's doc comment).
   */
  create(data: CreateIncentiveEventInput & { amountInr: number }) {
    return this.prisma.incentiveEvent.create({ data });
  }
}
