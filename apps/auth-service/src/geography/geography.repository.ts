import type { PrismaService } from '../prisma/prisma.service';

/** Data access for geography_units master data (State/District/Block/PHC/Sub-centre/Village/Pada). */
export class GeographyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.geographyUnit.findUnique({ where: { geographyUnitId: id } });
  }
}
