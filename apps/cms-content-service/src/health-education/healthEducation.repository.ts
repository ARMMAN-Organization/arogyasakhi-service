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
  findMany(filters: { riskConditionId?: string; stage?: string; conditionLabel?: string }) {
    return this.prisma.healthEducationMessage.findMany({
      where: {
        isDeleted: false,
        ...(filters.riskConditionId ? { riskConditionId: filters.riskConditionId } : {}),
        ...(filters.stage ? { stage: filters.stage } : {}),
        ...(filters.conditionLabel ? { conditionLabel: filters.conditionLabel } : {}),
      },
      // sortOrder preserves the source CSV's original row order (see
      // seed.ts) — used only as the outermost tiebreaker so conditions keep
      // the CSV's authored sequence when no conditionLabel filter narrows
      // the result; conditionLabel/messageOrder still decide the actual
      // grouping and intra-condition sequence.
      orderBy: [{ sortOrder: 'asc' }, { conditionLabel: 'asc' }, { messageOrder: 'asc' }],
    });
  }
}
