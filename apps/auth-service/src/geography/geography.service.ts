import { badRequest, conflict, notFound } from '@armman/service-commons';
import type { GeographyRepository } from './geography.repository';
import type { CreateGeographyUnitInput } from './dto/create-geography-unit.dto';
import type { UpdateGeographyUnitInput } from './dto/update-geography-unit.dto';

/** Prisma unique-constraint violation code (parentId + geoType + geoCode). */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

/**
 * Fixed 7-level hierarchy order (SRS/ERD) — a unit's geoType must be exactly
 * one level below its parent's geoType. STATE is the only level with no
 * parent.
 */
const GEO_TYPE_ORDER = [
  'STATE',
  'DISTRICT',
  'BLOCK',
  'PHC',
  'SUBCENTRE',
  'VILLAGE',
  'PADA',
] as const;

/**
 * Response is projected to EXACTLY the fields the API documents
 * (geographyUnitSchema in geography.controller.ts) so internal audit columns
 * (createdByUserId, updatedByUserId, createdAt, updatedAt, isDeleted,
 * deletedAt) never leak into a response.
 */
function toApiGeographyUnit(u: Record<string, unknown>) {
  return {
    geographyUnitId: u.geographyUnitId,
    parentId: u.parentId,
    geoType: u.geoType,
    geoCode: u.geoCode,
    name: u.name,
    status: u.status,
  };
}

/** Business logic for geography_units master data reads. */
export class GeographyService {
  constructor(private readonly repository: GeographyRepository) {}

  async getById(id: string) {
    const unit = await this.repository.findById(id);
    if (!unit) throw notFound('Geography unit not found.');
    return toApiGeographyUnit(unit as unknown as Record<string, unknown>);
  }

  /** Returns `id`'s full ancestor chain, ordered from `id` itself up to STATE. */
  async getAncestors(id: string) {
    const chain = await this.repository.findAncestors(id);
    if (!chain.length) throw notFound('Geography unit not found.');
    return chain.map((u) => toApiGeographyUnit(u as unknown as Record<string, unknown>));
  }

  /**
   * Returns the direct children of `id` (one level down — e.g. all districts under a
   * state). Throws 404 only if `id` itself doesn't exist/is soft-deleted; a valid
   * parent with zero children returns `[]`, which is a normal result, not an error.
   */
  async getChildren(id: string) {
    const parent = await this.repository.findById(id);
    if (!parent) throw notFound('Geography unit not found.');

    const children = await this.repository.findChildren(id);
    return children.map((u) => toApiGeographyUnit(u as unknown as Record<string, unknown>));
  }

  /**
   * Batch-get geography units by id, for callers resolving many ids in one
   * request instead of one call per id (e.g. approval-service's Quick
   * Response card-detail list resolving each card's Pada). An unknown or
   * soft-deleted id is silently omitted rather than causing a 404 — this is
   * a batch lookup, not a fetch-by-id.
   */
  async getByIds(ids: string[]) {
    const units = await this.repository.findByIds(ids);
    return units.map((u) => toApiGeographyUnit(u as unknown as Record<string, unknown>));
  }

  /** Returns all top-level units (no parent, i.e. all STATEs). An empty result is valid. */
  async getRoots() {
    const roots = await this.repository.findRoots();
    return roots.map((u) => toApiGeographyUnit(u as unknown as Record<string, unknown>));
  }

  /**
   * Lists geography units for cascading-dropdown selection, filtered by
   * `geoType` and/or `parentId`. An empty result is a normal outcome (200 with
   * `[]`), not a 404 — this is a query, not a fetch-by-id. See the repository
   * for the no-filter default (top-level STATEs only).
   */
  async list(filters: { geoType?: string; parentId?: string }) {
    const units = await this.repository.findMany(filters);
    return units.map((u) => toApiGeographyUnit(u as unknown as Record<string, unknown>));
  }

  async create(input: CreateGeographyUnitInput, createdByUserId: string) {
    if (input.geoType === 'STATE') {
      if (input.parentId) {
        throw badRequest('parentId: Must be omitted for a STATE-level unit.');
      }
      // The DB's @@unique([parentId, geoType, geoCode]) can't catch STATE
      // duplicates — every STATE row has parentId = null, and Postgres never
      // treats two NULLs as equal in a unique index. Check explicitly here.
      if (input.geoCode && (await this.repository.stateGeoCodeExists(input.geoCode))) {
        throw conflict('A geography unit with this parent, geoType, and geoCode already exists.');
      }
    } else {
      if (!input.parentId) {
        throw badRequest('parentId: Required for every geoType except STATE.');
      }

      const parent = await this.repository.findById(input.parentId);
      if (!parent) throw notFound('Parent geography unit not found.');
      if (parent.status !== 'ACTIVE') {
        throw badRequest('parentId: Cannot create a child unit under an inactive parent.');
      }

      const parentLevel = GEO_TYPE_ORDER.indexOf(parent.geoType as (typeof GEO_TYPE_ORDER)[number]);
      const childLevel = GEO_TYPE_ORDER.indexOf(input.geoType);
      if (childLevel !== parentLevel + 1) {
        throw badRequest(
          `geoType: Must be exactly one level below the parent's geoType (${parent.geoType}).`,
        );
      }
    }

    try {
      const created = await this.repository.createUnit(input, createdByUserId);
      return toApiGeographyUnit(created as unknown as Record<string, unknown>);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict('A geography unit with this parent, geoType, and geoCode already exists.');
      }
      throw err;
    }
  }

  async update(id: string, input: UpdateGeographyUnitInput, updatedByUserId: string) {
    // Same NULL-parentId gap as create(): the DB's @@unique([parentId,
    // geoType, geoCode]) never fires for STATE rows, so a geoCode change on a
    // STATE needs its own check before hitting the repository.
    if (input.geoCode) {
      const existing = await this.repository.findById(id);
      if (
        existing?.geoType === 'STATE' &&
        (await this.repository.stateGeoCodeExists(input.geoCode, id))
      ) {
        throw conflict('A geography unit with this parent, geoType, and geoCode already exists.');
      }
    }

    try {
      const updated = await this.repository.updateUnit(id, input, updatedByUserId);
      if (!updated) throw notFound('Geography unit not found.');
      return toApiGeographyUnit(updated as unknown as Record<string, unknown>);
    } catch (err) {
      if (isUniqueConstraintViolation(err)) {
        throw conflict('A geography unit with this parent, geoType, and geoCode already exists.');
      }
      throw err;
    }
  }

  async remove(id: string, updatedByUserId: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Geography unit not found.');

    const hasChildren = await this.repository.hasActiveChildren(id);
    if (hasChildren) {
      throw conflict('Cannot delete a geography unit that has active child units.');
    }

    await this.repository.softDelete(id, updatedByUserId);
  }
}

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PRISMA_UNIQUE_CONSTRAINT_CODE
  );
}
