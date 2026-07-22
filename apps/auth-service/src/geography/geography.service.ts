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
}
