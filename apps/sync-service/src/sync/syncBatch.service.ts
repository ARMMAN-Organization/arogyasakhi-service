import { forbidden, type AuthenticatedUser } from '@armman/service-commons';
import type { SyncBatchRepository } from './syncBatch.repository';
import type { CreateSyncBatchInput } from './dto/create-syncBatch.dto';
import { listSakhiIdsForSupervisor } from './sakhi.client';

/** Sync-batch domain logic. Data access is delegated to the repository. */
export class SyncBatchService {
  constructor(private readonly repository: SyncBatchRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateSyncBatchInput) {
    return this.repository.create(dto);
  }

  /**
   * Last-synced timestamp for the Sakhi dashboard. A SAKHI caller may only
   * ask about their own userId; a SUPERVISOR may ask about a Sakhi in their
   * own roster; MANAGER/ADMIN are unscoped. Same IDOR guard pattern as
   * beneficiary-service/risk-referral-service's single-record scoping.
   */
  async getLastSyncedAt(
    userId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<Date | null> {
    if (caller.roles.includes('SAKHI')) {
      if (userId !== caller.id) {
        throw forbidden('A Sakhi may only view their own last-synced time.');
      }
    } else if (caller.roles.includes('SUPERVISOR')) {
      if (!caller.projectId) {
        throw forbidden('Supervisor caller has no project scope.');
      }
      const roster = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
      if (!roster.includes(userId)) {
        throw forbidden("userId is not in this Supervisor's roster.");
      }
    }
    return this.repository.findLastSyncedAt(userId);
  }
}
