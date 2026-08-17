import type { ProjectGeographyRepository } from './project-geography.repository';

/**
 * Response is projected to exactly the fields the API documents
 * (projectGeographySchema in project-geography.routes.ts), dropping internal
 * audit/soft-delete columns (createdByUserId, updatedByUserId, isDeleted,
 * deletedAt). `geographyUnitId` is returned as a bare scalar, not joined to
 * a full GeographyUnit row — `project_geographies.geography_unit_id` is kept
 * scalar per this schema's convention (see schema.prisma's comment on the
 * model), so a client resolves unit detail from its own
 * GET /geography-units download.
 */
function toApiProjectGeography(row: Record<string, unknown>) {
  return {
    id: row.id,
    projectId: row.projectId,
    geographyUnitId: row.geographyUnitId,
    activeFrom: row.activeFrom,
    activeTo: row.activeTo,
  };
}

/** Business logic for project↔geography-unit scoping reads. */
export class ProjectGeographyService {
  constructor(private readonly repository: ProjectGeographyRepository) {}

  /**
   * Rows currently active for a project — an unknown/empty projectId simply
   * yields an empty array, not a 404, matching listByProject-style reads
   * elsewhere in this service (e.g. sakhi.service.ts) that don't own the
   * `projects` table and so can't authoritatively distinguish "no project"
   * from "no mappings."
   */
  async list(projectId: string) {
    const rows = await this.repository.findActiveByProjectId(projectId, new Date());
    return rows.map((r) => toApiProjectGeography(r as unknown as Record<string, unknown>));
  }
}
