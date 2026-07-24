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

  /** Direct children of `parentId` (one level down), excluding soft-deleted, ordered by geoCode. */
  findChildren(parentId: string) {
    return this.prisma.geographyUnit.findMany({
      where: { parentId, isDeleted: false },
      orderBy: { geoCode: 'asc' },
    });
  }

  /** Top-level units (no parent — i.e. all STATEs), excluding soft-deleted, ordered by geoCode. */
  findRoots() {
    return this.prisma.geographyUnit.findMany({
      where: { parentId: null, isDeleted: false },
      orderBy: { geoCode: 'asc' },
    });
  }
}
