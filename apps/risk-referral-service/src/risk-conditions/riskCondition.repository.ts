import type { PrismaService } from '../prisma/prisma.service';

/** Data access for risk_conditions reference data. Read-only from this feature. */
export class RiskConditionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active, non-deleted RiskCondition rows matching any of the given codes. */
  findByConditionCodes(conditionCodes: string[]) {
    return this.prisma.riskCondition.findMany({
      where: { conditionCode: { in: conditionCodes }, status: 'ACTIVE', isDeleted: false },
      select: { id: true, conditionCode: true },
    });
  }
}
