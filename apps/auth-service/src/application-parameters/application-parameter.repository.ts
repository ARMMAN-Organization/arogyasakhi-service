import type { PrismaService } from '../prisma/prisma.service';

/**
 * Data access for application-wide configuration key/value parameters (e.g.
 * a sync interval, minimum supported app version, a feature-flag toggle) —
 * a flat store, not a category/hierarchy like LookupCategory/LookupValue.
 */
export class ApplicationParameterRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Every active parameter, ordered by key for a stable download order. */
  findAllActive() {
    return this.prisma.applicationParameter.findMany({
      where: { isActive: true },
      orderBy: { paramKey: 'asc' },
    });
  }

  /** The active parameter for `paramKey`, or `null` if missing/inactive. */
  findActiveByKey(paramKey: string) {
    return this.prisma.applicationParameter.findFirst({
      where: { paramKey, isActive: true },
    });
  }
}
