import { forbidden, type AuthenticatedUser } from '@armman/service-commons';
import type { StaleSakhisRepository, StaleSakhi } from './staleSakhis.repository';
import { listSakhiIdsForSupervisor } from './sakhi.client';

/**
 * Stale-Sakhi roster domain logic. Scopes the query to the calling
 * Supervisor's own roster (resolved via auth-service, since sync-service
 * owns no `sakhi_profiles` row of its own) before delegating to the
 * repository — same IDOR guard shape as `SyncBatchService.getLastSyncedAt`.
 */
export class StaleSakhisService {
  constructor(private readonly repository: StaleSakhisRepository) {}

  async listStale(
    days: number,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<StaleSakhi[]> {
    if (!caller.projectId) {
      throw forbidden('Supervisor caller has no project scope.');
    }
    const roster = await listSakhiIdsForSupervisor(
      caller.projectId,
      caller.id,
      authorizationHeader,
    );
    return this.repository.findStale(roster, days);
  }
}
