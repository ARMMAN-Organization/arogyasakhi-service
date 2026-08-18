import type { PrismaService } from '../prisma/prisma.service';

const MASTER_ROW_SELECT = {
  id: true,
  conditionCode: true,
  conditionName: true,
  entityType: true,
  phase: true,
  gradeScale: true,
  referralRequiredDefault: true,
  educationRequiredDefault: true,
  status: true,
} as const;

/** Data access for risk_conditions reference data. Read-only from this feature. */
export class RiskConditionRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active, non-deleted RiskCondition rows matching any of the given codes. */
  findByConditionCodes(conditionCodes: string[]) {
    return this.prisma.riskCondition.findMany({
      where: { conditionCode: { in: conditionCodes }, status: 'ACTIVE', isDeleted: false },
      select: MASTER_ROW_SELECT,
    });
  }

  /** Every ACTIVE, non-deleted RiskCondition row — the master-data download. */
  findAllActive() {
    return this.prisma.riskCondition.findMany({
      where: { status: 'ACTIVE', isDeleted: false },
      select: MASTER_ROW_SELECT,
    });
  }
}
