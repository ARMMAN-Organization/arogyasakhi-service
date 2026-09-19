import cron from 'node-cron';
import { acquireJobLock, ServiceTokenClient } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { SyncBatchRepository } from '../sync/syncBatch.repository';
import { listAllProjectIds, listActiveSakhisForProject } from './roster.client';
import { createSyncDelayEscalationEvent } from '../sync/systemEscalation.client';

const JOB_NAME = 'sync-delay-escalation-sweep';
const LOCK_DURATION_MS = 55 * 60 * 1000; // slightly under the default daily tick's own margin
// Bounds how many Sakhis are escalated concurrently per project — a large
// roster processed strictly sequentially risked a runtime that could
// approach LOCK_DURATION_MS under normal latency. Same rationale/value as
// risk-referral-service's overdueFollowup.job.ts CONCURRENCY.
const CONCURRENCY = 15;

export interface SyncDelayEscalationJobDeps {
  prisma: PrismaService;
  syncDelayThresholdHours: number;
  getSystemToken: () => Promise<string>;
}

/**
 * One run of the SYNC_DELAY escalation sweep — proactively raises an
 * escalation for every Sakhi across every project whose last COMPLETED
 * sync is older than the configured threshold (or who has never synced),
 * independent of whether her Supervisor ever opens the roster dashboard
 * (SyncBatchService.getLastSyncedAtByRoster's own read-time escalation
 * stays as a second, harmless trigger — POST /escalation-events is
 * idempotent per (escalationType, sakhiUserId), so the two never
 * double-create a row).
 *
 * Idempotency against duplicate escalations is enforced server-side by
 * notification-escalation-service's EscalationService.create (see its own
 * doc comment) — this job doesn't need its own dedup check, only the
 * DB-backed run lock below to stop two replicas processing the same
 * roster concurrently.
 */
export async function runSyncDelayEscalationJob(deps: SyncDelayEscalationJobDeps): Promise<void> {
  const got = await acquireJobLock(deps.prisma, JOB_NAME, LOCK_DURATION_MS);
  if (!got) {
    console.log(`[${JOB_NAME}] Lock held by another run — skipping this tick.`);
    return;
  }

  let systemAccessToken: string;
  try {
    systemAccessToken = await deps.getSystemToken();
  } catch (err) {
    console.error(`[${JOB_NAME}] Unable to mint a service token — skipping this tick:`, err);
    return;
  }

  let projectIds: string[];
  try {
    projectIds = await listAllProjectIds(systemAccessToken);
  } catch (err) {
    console.error(`[${JOB_NAME}] Unable to resolve projects — skipping this tick:`, err);
    return;
  }

  const batchRepository = new SyncBatchRepository(deps.prisma);
  const thresholdMs = deps.syncDelayThresholdHours * 60 * 60 * 1000;

  /** One Sakhi's stale-check-and-escalate sequence. Never throws — every
   * failure is caught and logged so it can't abort the rest of the batch. */
  async function processSakhi(
    sakhi: { sakhiId: string; supervisorId: string | null },
    lastSyncedAt: Date | undefined,
  ): Promise<void> {
    try {
      const isDelayed = !lastSyncedAt || Date.now() - lastSyncedAt.getTime() > thresholdMs;
      if (!isDelayed) return;

      if (!sakhi.supervisorId) {
        // assignedSupervisorId is required by createEscalationEventSchema —
        // an unassigned/orphaned Sakhi has no owning Supervisor to escalate
        // to. Skip rather than fail (same stance as overdueFollowupJob).
        console.error(
          `[${JOB_NAME}] Sakhi ${sakhi.sakhiId} has no assigned Supervisor — skipping escalation.`,
        );
        return;
      }

      await createSyncDelayEscalationEvent(sakhi.sakhiId, sakhi.supervisorId, systemAccessToken);
    } catch (err) {
      console.error(`[${JOB_NAME}] Failed processing Sakhi ${sakhi.sakhiId}:`, err);
    }
  }

  for (const projectId of projectIds) {
    let sakhis: { sakhiId: string; supervisorId: string | null }[];
    try {
      sakhis = await listActiveSakhisForProject(projectId, systemAccessToken);
    } catch (err) {
      console.error(`[${JOB_NAME}] Unable to resolve Sakhis for project ${projectId}:`, err);
      continue;
    }
    if (sakhis.length === 0) continue;

    const lastSyncedByUserId = await batchRepository.findLastSyncedAtByUserIds(
      sakhis.map((s) => s.sakhiId),
    );

    for (let i = 0; i < sakhis.length; i += CONCURRENCY) {
      const batch = sakhis.slice(i, i + CONCURRENCY);
      await Promise.all(
        batch.map((sakhi) => processSakhi(sakhi, lastSyncedByUserId.get(sakhi.sakhiId))),
      );
    }
  }
}

/** Wires the real dependencies and registers the node-cron schedule at boot. */
export function scheduleSyncDelayEscalationJob(
  prisma: PrismaService,
  cronExpression: string,
  syncDelayThresholdHours: number,
  clientId: string | undefined,
  clientSecret: string | undefined,
): void {
  const tokenClient =
    clientId && clientSecret ? new ServiceTokenClient(clientId, clientSecret) : null;

  cron.schedule(cronExpression, () => {
    void runSyncDelayEscalationJob({
      prisma,
      syncDelayThresholdHours,
      getSystemToken: () => {
        if (!tokenClient) {
          return Promise.reject(
            new Error('SERVICE_ACCOUNT_CLIENT_ID/SECRET not configured for this service.'),
          );
        }
        return tokenClient.getToken();
      },
    }).catch((err) => console.error(`[${JOB_NAME}] Unhandled error:`, err));
  });
}
