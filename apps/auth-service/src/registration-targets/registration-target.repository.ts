import type { PrismaService } from '../prisma/prisma.service';

/** Data access for Sakhi-grain registration target reads. */
export class RegistrationTargetRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every non-deleted target row for a Sakhi, oldest period first. */
  findBySakhiId(sakhiId: string) {
    return this.prisma.sakhiRegistrationTarget.findMany({
      where: { sakhiId, isDeleted: false },
      orderBy: { targetPeriodStart: 'asc' },
    });
  }
}
