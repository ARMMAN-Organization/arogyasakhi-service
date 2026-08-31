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

  for (const followup of overdue) {
    try {
      const beneficiaryId = followup.referral.beneficiaryId;
      const beneficiary = await beneficiaryClient.getById(beneficiaryId, authorizationHeader);
      const sakhi = beneficiary
        ? await findSakhiById(beneficiary.sakhiId, authorizationHeader)
        : null;
      const supervisorId = sakhi?.supervisorId ?? null;

      const event = await createEscalationEvent(
        {
          beneficiaryId,
          escalationType: 'REFERRAL_FOLLOWUP_MISSED',
          referralId: followup.referralId,
          assignedSupervisorId: supervisorId ?? undefined,
        },
        systemAccessToken,
      );

      if (supervisorId && event.status === 'OPEN') {
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
