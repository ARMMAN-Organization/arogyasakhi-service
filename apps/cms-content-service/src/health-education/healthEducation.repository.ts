import type { PrismaService } from '../prisma/prisma.service';

/** Data access for health_education_messages. Read-only from this feature. */
export class HealthEducationRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Filters independently — both, either, or neither may be given.
   * Omitting both returns every non-deleted message, matching this repo's
   * GET /media / GET /learn-more/sections precedent of "no filter =
   * everything" rather than an error.
   */
  findMany(filters: { riskConditionId?: string; stage?: string }) {
    return this.prisma.healthEducationMessage.findMany({
      where: {
        isDeleted: false,
        ...(filters.riskConditionId ? { riskConditionId: filters.riskConditionId } : {}),
        ...(filters.stage ? { stage: filters.stage } : {}),
      },
      orderBy: [{ conditionLabel: 'asc' }, { messageOrder: 'asc' }],
    });
  }
}
