import type { PrismaService } from '../prisma/prisma.service';

const MASTER_ROW_SELECT = {
  id: true,
  visitCode: true,
  visitType: true,
  displayName: true,
  entityType: true,
  sequenceOrder: true,
  description: true,
  isActive: true,
} as const;

/** Data access for visit_masters reference data. Read-only from this feature. */
export class VisitMasterRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Active, non-deleted VisitMaster rows matching any of the given visit codes. */
  findByVisitCodes(visitCodes: string[]) {
    return this.prisma.visitMaster.findMany({
      where: { visitCode: { in: visitCodes }, isActive: true, isDeleted: false },
      select: MASTER_ROW_SELECT,
    });
  }

  /** Every ACTIVE, non-deleted VisitMaster row — the master-data download. */
  findAllActive() {
    return this.prisma.visitMaster.findMany({
      where: { isActive: true, isDeleted: false },
      select: MASTER_ROW_SELECT,
    });
  }
}
