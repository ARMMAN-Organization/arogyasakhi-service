import type { GeographyRepository } from '../geography/geography.repository';
import type { ProjectRepository } from '../projects/project.repository';

/**
 * Response is projected to exactly the fields a delta client needs —
 * including `isDeleted`/`deletedAt`, unlike the read APIs' projections
 * (`toApiGeographyUnit`/`toApiProject`), which deliberately strip them since
 * a soft-deleted row is never resolvable there in the first place. A delta
 * client needs to see deletions to prune its local cache.
 */
function toApiGeographyUnit(u: Record<string, unknown>) {
  return {
    geographyUnitId: u.geographyUnitId,
    parentId: u.parentId,
    geoType: u.geoType,
    geoCode: u.geoCode,
    name: u.name,
    status: u.status,
    updatedAt: u.updatedAt,
    isDeleted: u.isDeleted,
    deletedAt: u.deletedAt,
  };
}

function toApiFunder(f: Record<string, unknown> | null) {
  if (!f) return null;
  return {
    funderId: f.funderId,
    funderCode: f.funderCode,
    funderName: f.funderName,
    status: f.status,
    updatedAt: f.updatedAt,
    isDeleted: f.isDeleted,
    deletedAt: f.deletedAt,
  };
}

function toApiProject(p: Record<string, unknown>) {
  return {
    projectId: p.projectId,
    funderId: p.funderId,
    funder: toApiFunder(p.funder as Record<string, unknown> | null),
    projectCode: p.projectCode,
    projectName: p.projectName,
    financialYear: p.financialYear,
    startDate: p.startDate,
    endDate: p.endDate,
    status: p.status,
    updatedAt: p.updatedAt,
    isDeleted: p.isDeleted,
    deletedAt: p.deletedAt,
  };
}

/**
 * Master-data delta sync — lets an offline-first client (Sakhi/Supervisor
 * app) pull geography/project/funder rows changed since its last sync
 * instead of re-fetching the full dataset every time. Per the HLD's Offline
 * Sync Flow (§3.2 step 6), this is one part of what a client downloads
 * alongside rule packs, content packs, and notifications — those live in
 * other services and are out of scope here (forklift rule: this endpoint
 * only aggregates auth-service's own master data).
 */
export class MasterDataService {
  constructor(
    private readonly geographyRepository: GeographyRepository,
    private readonly projectRepository: ProjectRepository,
  ) {}

  async getDeltas(since: string | undefined) {
    const sinceDate = since ? new Date(since) : undefined;

    const [geographyUnits, projects, funders] = await Promise.all([
      this.geographyRepository.findUpdatedSince(sinceDate),
      this.projectRepository.findProjectsUpdatedSince(sinceDate),
      this.projectRepository.findFundersUpdatedSince(sinceDate),
    ]);

    return {
      serverTime: new Date(),
      geographyUnits: geographyUnits.map((u) =>
        toApiGeographyUnit(u as unknown as Record<string, unknown>),
      ),
      projects: projects.map((p) => toApiProject(p as unknown as Record<string, unknown>)),
      funders: funders.map((f) => toApiFunder(f as unknown as Record<string, unknown>)),
    };
  }
}
