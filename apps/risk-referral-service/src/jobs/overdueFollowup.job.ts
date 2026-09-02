import cron from 'node-cron';
import { acquireJobLock, ServiceTokenClient } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { ReferralRepository } from '../referrals/referral.repository';
import { BeneficiaryClient } from '../referrals/beneficiary.client';
import { findSakhiById } from '../referrals/sakhi.client';
import { createEscalationEvent, createNotification } from '../referrals/systemEscalation.client';

const JOB_NAME = 'referral-followup-overdue-escalation';
const LOCK_DURATION_MS = 55 * 60 * 1000; // slightly under the default daily tick's own margin
const MAX_FOLLOWUPS_PER_TICK = 500;
// Bounds how many follow-ups are in flight at once (each doing up to 4
// sequential downstream HTTP calls) — processing the full 500-item cap
// strictly sequentially risked a multi-minute runtime that could approach
// LOCK_DURATION_MS under normal latency, or exceed it under a large
// first-deploy backlog or degraded downstream latency, letting a second
// replica's next tick re-acquire the lock and double-process. A bounded
// pool keeps one slow/hung item from serializing the whole batch behind it.
const CONCURRENCY = 15;

export interface OverdueFollowupJobDeps {
  prisma: PrismaService;
  getSystemToken: () => Promise<string>;
}

/**
 * One run of the referral follow-up missed-escalation job (build plan's
 * "Referral follow-up missed" item — extends the existing overdue-follow-up
 * query, which was previously read-only, to actually raise an escalation +
 * notify the Supervisor). Idempotency against duplicate escalations is
 * enforced server-side by notification-escalation-service's
 * EscalationService.create (see its own doc comment) — this job doesn't
 * need its own dedup check, only the DB-backed run lock below to stop two
 * replicas processing the same backlog concurrently.
 */
export async function runOverdueFollowupJob(deps: OverdueFollowupJobDeps): Promise<void> {
  const got = await acquireJobLock(deps.prisma, JOB_NAME, LOCK_DURATION_MS);
  if (!got) {
    console.log(`[${JOB_NAME}] Lock held by another run — skipping this tick.`);
    return;
  }

  const referralRepo = new ReferralRepository(deps.prisma);
  const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
  const overdue = await referralRepo.findOverduePendingFollowups(today, MAX_FOLLOWUPS_PER_TICK);
  if (overdue.length === 0) return;

  let authorizationHeader: string;
  try {
    authorizationHeader = `Bearer ${await deps.getSystemToken()}`;
  } catch (err) {
    console.error(`[${JOB_NAME}] Unable to mint a service token — skipping this tick:`, err);
    return;
  }

  const beneficiaryClient = new BeneficiaryClient();
  const systemAccessToken = authorizationHeader.replace(/^Bearer /, '');

  /** One follow-up's full escalate-and-notify sequence. Never throws — every
   * failure is caught and logged so it can't abort the rest of the batch. */
  async function processFollowup(followup: (typeof overdue)[number]): Promise<void> {
    try {
      const beneficiaryId = followup.referral.beneficiaryId;
      const beneficiary = await beneficiaryClient.getById(beneficiaryId, authorizationHeader);
      const sakhi = beneficiary
        ? await findSakhiById(beneficiary.sakhiId, authorizationHeader)
        : null;
      const supervisorId = sakhi?.supervisorId ?? null;

      if (!supervisorId) {
        // assignedSupervisorId is required by createEscalationEventSchema —
        // an unassigned/orphaned Sakhi has no owning Supervisor to escalate
        // to, so attempting the call would only 400. Skip rather than fail.
        console.error(
          `[${JOB_NAME}] Follow-up ${followup.id}: Sakhi has no assigned Supervisor — skipping escalation.`,
        );
        return;
      }

      const event = await createEscalationEvent(
        {
          beneficiaryId,
          escalationType: 'REFERRAL_FOLLOWUP_MISSED',
          referralId: followup.referralId,
          assignedSupervisorId: supervisorId,
        },
        systemAccessToken,
      );
      await referralRepo.markFollowupEscalated(followup.id);

      // Only the tick that actually raises a new escalation notifies —
      // event.status is 'OPEN' on every re-processing of an already-open
      // row too, so gating on wasCreated (not status) prevents sending a
      // fresh notification every single day the follow-up stays unresolved.
      if (event.wasCreated) {
        try {
          await createNotification(
            {
              recipientUserId: supervisorId,
              notificationType: 'REFERRAL_FOLLOWUP_OVERDUE',
              title: 'A referral follow-up is overdue and needs review',
              linkedEntityType: 'REFERRAL_FOLLOWUP',
              linkedEntityId: followup.id,
            },
            systemAccessToken,
          );
        } catch (err) {
          console.error(`[${JOB_NAME}] Escalation ${event.id} raised, notification failed:`, err);
        }
      }
    } catch (err) {
      // One follow-up's bad data must not abort the rest of this tick's batch.
      console.error(`[${JOB_NAME}] Failed processing follow-up ${followup.id}:`, err);
    }
  }

  for (let i = 0; i < overdue.length; i += CONCURRENCY) {
    const batch = overdue.slice(i, i + CONCURRENCY);
    await Promise.all(batch.map(processFollowup));
  }
}

/** Wires the real dependencies and registers the node-cron schedule at boot. */
export function scheduleOverdueFollowupJob(
  prisma: PrismaService,
  cronExpression: string,
  clientId: string | undefined,
  clientSecret: string | undefined,
): void {
  const tokenClient =
    clientId && clientSecret ? new ServiceTokenClient(clientId, clientSecret) : null;

  cron.schedule(cronExpression, () => {
    void runOverdueFollowupJob({
      prisma,
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
