import type { GeographyUnit } from '../../../../node_modules/.prisma/client-auth-service';
import type { PrismaService } from '../prisma/prisma.service';
import type { CreateGeographyUnitInput } from './dto/create-geography-unit.dto';
import type { UpdateGeographyUnitInput } from './dto/update-geography-unit.dto';

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

  /**
   * True if a non-deleted STATE with `geoCode` already exists (other than
   * `excludeId`, so an update can check against sibling STATEs without
   * tripping over its own current row). `@@unique([parentId, geoType,
   * geoCode])` can't catch this at the DB level — every STATE row has
   * `parentId = null`, and Postgres never treats two NULLs as equal in a
   * unique index, so duplicate STATEs silently bypass the constraint. This
   * app-level check is the only thing enforcing STATE geoCode uniqueness.
   */
  async stateGeoCodeExists(geoCode: string, excludeId?: string): Promise<boolean> {
    const existing = await this.prisma.geographyUnit.findFirst({
      where: {
        parentId: null,
        geoType: 'STATE',
        geoCode,
        isDeleted: false,
        ...(excludeId ? { geographyUnitId: { not: excludeId } } : {}),
      },
      select: { geographyUnitId: true },
    });
    return existing !== null;
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

  /**
   * All geography units — including soft-deleted rows, so a delta client can
   * tell a deletion apart from "never existed" — with `updatedAt` after
   * `since` (or every row, when `since` is omitted). `updatedAt` covers both
   * creates and updates: Prisma's `@updatedAt` sets it on insert too.
   */
  findUpdatedSince(since: Date | undefined) {
    return this.prisma.geographyUnit.findMany({
      where: since ? { updatedAt: { gt: since } } : undefined,
      orderBy: { updatedAt: 'asc' },
    });
  }

  createUnit(data: CreateGeographyUnitInput, createdByUserId: string) {
    return this.prisma.geographyUnit.create({
      data: {
        parentId: data.parentId ?? null,
        geoType: data.geoType,
        geoCode: data.geoCode ?? null,
        name: data.name,
        createdByUserId,
        updatedByUserId: createdByUserId,
      },
    });
  }

  async updateUnit(id: string, data: UpdateGeographyUnitInput, updatedByUserId: string) {
    const existing = await this.findById(id);
    if (!existing) return null;

    return this.prisma.geographyUnit.update({
      where: { geographyUnitId: id },
      data: { ...data, updatedByUserId },
    });
  }

  /** True if `id` has any non-soft-deleted direct child — used to block delete. */
  async hasActiveChildren(id: string): Promise<boolean> {
    const child = await this.prisma.geographyUnit.findFirst({
      where: { parentId: id, isDeleted: false },
      select: { geographyUnitId: true },
    });
    return child !== null;
  }

  async softDelete(id: string, updatedByUserId: string) {
    const existing = await this.findById(id);
    if (!existing) return null;

    return this.prisma.geographyUnit.update({
      where: { geographyUnitId: id },
      data: { isDeleted: true, deletedAt: new Date(), updatedByUserId },
    });
  }
}
