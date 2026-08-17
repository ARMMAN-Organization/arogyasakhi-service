import type { SyncPendingRepository, PendingSyncItem } from './syncPending.repository';

/** Sync-pending domain logic: resolves which user's items to look up, then
 * delegates data access to the repository. */
export class SyncPendingService {
  constructor(private readonly repository: SyncPendingRepository) {}

  /**
   * Lists outstanding (not yet `SUCCESS`) sync items for a user. Defaults to
   * the authenticated caller's own id when `requestedUserId` is omitted —
   * this matches how a Sakhi's own mobile app checks its own pending
   * uploads without needing to know its own `userId` up front.
   */
  listPending(requestedUserId: string | undefined, callerId: string): Promise<PendingSyncItem[]> {
    return this.repository.findPending(requestedUserId ?? callerId);
  }
}
