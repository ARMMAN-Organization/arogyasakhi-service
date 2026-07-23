import type { GeographyUnit } from '../../../../node_modules/.prisma/client-auth-service';
import type { PrismaService } from '../prisma/prisma.service';

/** Data access for geography_units master data (State/District/Block/PHC/Sub-centre/Village/Pada). */
export class GeographyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    // Filter out soft-deleted rows, consistent with project.repository.ts and
    // root CLAUDE.md §11 ("soft-delete where needed"). A soft-deleted PHC/Block
    // must not be silently resolvable when deriving healthBlockId for a new
    // beneficiary. findFirst (not findUnique) so the non-unique isDeleted filter
    // can be applied alongside the id.
    return this.prisma.geographyUnit.findFirst({
      where: { geographyUnitId: id, isDeleted: false },
    });
  }

  /**
   * Walks `parentId` up from `id` to the STATE root, one query per level (the
   * hierarchy is capped at 7 levels — State/District/Block/PHC/Sub-centre/
   * Village/Pada — so this never runs more than 7 round-trips). Returns the
   * chain ordered from `id` itself up to the root, or `[]` if `id` doesn't exist.
   */
  async findAncestors(id: string) {
    const chain: GeographyUnit[] = [];
    let currentId: string | null = id;

    while (currentId) {
      const unit: GeographyUnit | null = await this.prisma.geographyUnit.findFirst({
        where: { geographyUnitId: currentId, isDeleted: false },
      });
      if (!unit) break;
      chain.push(unit);
      currentId = unit.parentId;
    }

    return chain;
  }

  /**
   * Lists geography units for cascading-dropdown selection (SRS FR line 971),
   * excluding soft-deleted rows, ordered by geoCode. Filters:
   * - both/neither absent: with no filter at all, defaults to top-level units
   *   (parentId null — the STATEs), so an unfiltered call never dumps the whole
   *   multi-level tree; callers walk down one level per request.
   * - geoType and/or parentId narrow the result (e.g. geoType=DISTRICT +
   *   parentId=<stateId> → districts of that state).
   * Capped at 500 rows — a defensive bound; a single level of the hierarchy
   * (e.g. villages under one taluka) is well within this.
   */
  findMany(filters: { geoType?: string; parentId?: string }) {
    const where: NonNullable<Parameters<typeof this.prisma.geographyUnit.findMany>[0]>['where'] = {
      isDeleted: false,
    };
    // geoType is a Prisma GeoType enum column; the caller-supplied string is
    // already constrained to the valid set by the controller's Zod query schema.
    if (filters.geoType) where.geoType = filters.geoType as never;
    if (filters.parentId) where.parentId = filters.parentId;
    // Default to roots only when NO filter was supplied — avoids returning the
    // entire tree. If either filter is present, honor it as given.
    if (!filters.geoType && !filters.parentId) where.parentId = null;

    return this.prisma.geographyUnit.findMany({
      where,
      orderBy: { geoCode: 'asc' },
      take: 500,
    });
  }
}
