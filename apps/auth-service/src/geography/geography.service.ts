import { notFound } from '@armman/service-commons';
import type { GeographyRepository } from './geography.repository';

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
}
