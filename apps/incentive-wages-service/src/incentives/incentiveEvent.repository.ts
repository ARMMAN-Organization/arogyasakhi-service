import type { PrismaService } from '../prisma/prisma.service';
import type { CreateIncentiveEventInput } from './dto/create-incentiveEvent.dto';

/** Data access for incentive events. Owns only this service's `incentive_events` table. */
export class IncentiveEventRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.incentiveEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateIncentiveEventInput) {
    return this.prisma.incentiveEvent.create({ data });
  }
}
