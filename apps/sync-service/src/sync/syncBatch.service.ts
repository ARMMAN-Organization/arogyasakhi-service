import {
  forbidden,
  type AuthenticatedUser,
  type ServiceTokenClient,
} from '@armman/service-commons';
import type { SyncBatchRepository } from './syncBatch.repository';
import type { CreateSyncBatchInput } from './dto/create-syncBatch.dto';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import { createSyncDelayEscalationEvent } from './systemEscalation.client';

/** MANAGER and ADMIN are unrestricted — same convention as every other service. */
function isPrivileged(caller: AuthenticatedUser): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

export interface RosterSyncStatus {
  userId: string;
  lastSyncedAt: Date | null;
  isDelayed: boolean;
}

/** Sync-batch domain logic. Data access is delegated to the repository. */
export class SyncBatchService {
  constructor(
    private readonly repository: SyncBatchRepository,
    // Optional: SYNC_DELAY escalation-raising is skipped (roster data is
    // still returned) when no service-account credential is configured —
    // see app-config.ts's SERVICE_ACCOUNT_CLIENT_ID doc comment.
    private readonly serviceTokenClient: ServiceTokenClient | null,
    private readonly syncDelayThresholdHours: number,
  ) {}

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
    if (!isPrivileged(caller)) {
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
    }
    return this.repository.findLastSyncedAt(userId);
  }

  /**
   * The Supervisor dashboard's roster sync-status list (build plan's "Sync
   * delay" item) — one row per Sakhi in the caller's own roster, each
   * flagged `isDelayed` when their last COMPLETED sync is older than
   * SYNC_DELAY_THRESHOLD_HOURS (or they've never synced at all). SUPERVISOR
   * only, always the caller's own roster — unlike GET /sync/last-synced,
   * this endpoint has no MANAGER/ADMIN "view any roster" variant yet since
   * there's no caller-supplied supervisorId to resolve a projectId for.
   *
   * A passive list, not a push: per the build plan, this raises a
   * SYNC_DELAY escalation for each delayed Sakhi (so it surfaces wherever
   * escalations are already reviewed) but never calls POST /notifications.
   * Escalation-raising is best-effort — a failure for one Sakhi is logged,
   * not thrown, so a transient notification-escalation-service blip never
   * turns a dashboard read into a 502.
   */
  async getLastSyncedAtByRoster(
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<RosterSyncStatus[]> {
    if (!caller.projectId) {
      throw forbidden('Supervisor caller has no project scope.');
    }
    const roster = await listSakhiIdsForSupervisor(
      caller.projectId,
      caller.id,
      authorizationHeader,
    );
    const lastSyncedByUserId = await this.repository.findLastSyncedAtByUserIds(roster);

    const thresholdMs = this.syncDelayThresholdHours * 60 * 60 * 1000;
    const now = Date.now();
    const results: RosterSyncStatus[] = roster.map((userId) => {
      const lastSyncedAt = lastSyncedByUserId.get(userId) ?? null;
      const isDelayed = !lastSyncedAt || now - lastSyncedAt.getTime() > thresholdMs;
      return { userId, lastSyncedAt, isDelayed };
    });

    if (this.serviceTokenClient) {
      const systemToken = await this.serviceTokenClient.getToken().catch((err) => {
        console.error('Unable to mint a service token for SYNC_DELAY escalations:', err);
        return null;
      });
      if (systemToken) {
        await Promise.all(
          results
            .filter((r) => r.isDelayed)
            .map((r) =>
              createSyncDelayEscalationEvent(r.userId, systemToken).catch((err) => {
                console.error(`Unable to raise SYNC_DELAY escalation for ${r.userId}:`, err);
              }),
            ),
        );
      }
    }

    return results;
  }
}
