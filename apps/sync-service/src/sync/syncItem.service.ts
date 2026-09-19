import { forbidden, notFound, type AuthenticatedUser } from '@armman/service-commons';
import type { SyncItemRepository, CreatedSyncItem } from './syncItem.repository';
import type { CreateSyncItemsInput } from './dto/create-syncItem.dto';
import { SakhiClient } from './sakhi.client';

/** MANAGER and ADMIN are unrestricted — same convention as syncBatch.service.ts. */
function isPrivileged(caller: AuthenticatedUser): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

/**
 * Sync-item domain logic: authorizes the batch the items are reported
 * against, then delegates the dedupe/retry write to the repository.
 */
export class SyncItemService {
  constructor(
    private readonly repository: SyncItemRepository,
    private readonly sakhiClient: SakhiClient = new SakhiClient(),
  ) {}

  /**
   * Reports a bulk array of sync items for one `syncBatchId`. All items in
   * one call must belong to the same batch — the DTO doesn't enforce this
   * structurally (each item carries its own `syncBatchId`), so it's checked
   * here: a SAKHI reporting items against someone else's batch (whether by
   * a real ownership violation or a client-side bug picking up a stale
   * batch id) is rejected outright rather than silently attributed to the
   * wrong Sakhi's sync history.
   *
   * A SAKHI caller may only report items for a batch they own; a SUPERVISOR
   * may additionally report for a batch owned by a Sakhi on their own
   * roster (matches syncPending.service.ts's ownership pattern, since a
   * Supervisor may resubmit on a Sakhi's behalf during support/troubleshooting).
   */
  async create(
    dto: CreateSyncItemsInput,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<CreatedSyncItem[]> {
    const batchIds = new Set(dto.items.map((item) => item.syncBatchId));

    for (const syncBatchId of batchIds) {
      const ownerId = await this.repository.findBatchOwner(syncBatchId);
      if (!ownerId) throw notFound(`Sync batch ${syncBatchId} not found.`);
      await this.assertCallerCanReportFor(ownerId, caller, authorizationHeader);
    }

    return Promise.all(dto.items.map((item) => this.repository.create(item)));
  }

  private async assertCallerCanReportFor(
    ownerId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<void> {
    if (isPrivileged(caller)) return;
    if (ownerId === caller.id) return;

    if (caller.roles.includes('SUPERVISOR')) {
      const sakhi = await this.sakhiClient.findById(ownerId, authorizationHeader);
      if (sakhi?.supervisorId === caller.id) return;
    }

    throw forbidden('You do not have access to this sync batch.');
  }
}
