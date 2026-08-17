import type { PrismaService } from '../prisma/prisma.service';

const MASTER_ROW_SELECT = {
  id: true,
  parameterCode: true,
  parameterName: true,
  entityType: true,
  unit: true,
  dataType: true,
  status: true,
} as const;

/** Data access for risk_parameters reference data. Read-only from this feature. */
export class RiskParameterRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active RiskParameter rows matching any of the given codes. */
  findByParameterCodes(parameterCodes: string[]) {
    return this.prisma.riskParameter.findMany({
      where: { parameterCode: { in: parameterCodes }, status: 'ACTIVE' },
      select: MASTER_ROW_SELECT,
    });
  }

  /** Every ACTIVE RiskParameter row — the master-data download. */
  findAllActive() {
    return this.prisma.riskParameter.findMany({
      where: { status: 'ACTIVE' },
      select: MASTER_ROW_SELECT,
    });
  }
}
