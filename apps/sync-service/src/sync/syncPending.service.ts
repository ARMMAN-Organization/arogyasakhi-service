import { forbidden, type AuthenticatedUser } from '@armman/service-commons';
import type { SyncPendingRepository, PendingSyncItem } from './syncPending.repository';
import { SakhiClient } from './sakhi.client';

/** Sync-pending domain logic: resolves which user's items to look up, then
 * delegates data access to the repository. */
export class SyncPendingService {
  constructor(
    private readonly repository: SyncPendingRepository,
    private readonly sakhiClient: SakhiClient = new SakhiClient(),
  ) {}

  /**
   * Lists outstanding (not yet `SUCCESS`) sync items for a user. Defaults to
   * the authenticated caller's own id when `requestedUserId` is omitted —
   * this matches how a Sakhi's own mobile app checks its own pending
   * uploads without needing to know its own `userId` up front. A SAKHI
   * caller may only request her own id (any other supplied `userId` is
   * rejected — a Sakhi has no roster to check against). A SUPERVISOR may
   * additionally request a `userId` belonging to a Sakhi on their own
   * roster, resolved via auth-service since sync-service owns no
   * sakhi_profiles row of its own.
   */
  async listPending(
    requestedUserId: string | undefined,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<PendingSyncItem[]> {
    if (!requestedUserId || requestedUserId === caller.id) {
      return this.repository.findPending(requestedUserId ?? caller.id);
    }

    if (caller.roles.includes('SUPERVISOR')) {
      const sakhi = await this.sakhiClient.findById(requestedUserId, authorizationHeader);
      if (sakhi?.supervisorId === caller.id) {
        return this.repository.findPending(requestedUserId);
      }
    }

    throw forbidden('You do not have access to this user.');
  }
}
