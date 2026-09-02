import cron from 'node-cron';
import { acquireJobLock, ServiceTokenClient } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { VisitScheduleRepository } from '../visit-schedules/visitSchedule.repository';
import { VisitInstanceRepository } from '../visits/visitInstance.repository';
import { resolveVisitStatusIdByCode } from '../lookups/lookup.client';
import { findBeneficiaryById, findBeneficiaryOwnership } from '../beneficiaries/beneficiary.client';
import { findSakhiById } from '../sakhis/sakhi.client';
import { evaluateEscalation } from '../rules/evaluateEscalation.client';
import { createEscalationEvent, createNotification } from '../escalations/systemEscalation.client';
import type { VisitCodeType } from '../../../../node_modules/.prisma/client-visit-form-service';

const JOB_NAME = 'missed-visit-escalation';
const LOCK_DURATION_MS = 25 * 60 * 1000; // slightly under the default 30-min tick interval
const MAX_SCHEDULES_PER_TICK = 200;
// This job has no human identity — mirrors postEddVisitGeneration.job.ts's
// own SYSTEM_CALLER.id convention, used as VisitStatusHistory.changedByUserId
// for cron-driven MISSED transitions.
const SYSTEM_CALLER_ID = 'missed-visit-escalation-job';

/**
 * `VisitCodeType` -> the ESCALATION rule pack's (visitFamily, isHrVisit)
 * input shape (see escalation.rulesJson.ts) and the escalationType code
 * POST /escalation-events expects for a missed visit in that family. DELIVERY
 * has neither an escalation-rule branch nor a "missed" escalationType — it's
 * the ARMMAN open question in the build plan (whether DELIVERY_FORM_PENDING
 * needs its own earlier threshold) and is deliberately left unhandled here.
 */
const VISIT_TYPE_ESCALATION: Record<
  string,
  { visitFamily: string; isHrVisit: boolean; escalationType: string } | undefined
> = {
  ANC: { visitFamily: 'ANC', isHrVisit: false, escalationType: 'ANC_2_MISSED' },
  ANC_HR: { visitFamily: 'ANC', isHrVisit: true, escalationType: 'ANC_HR_MISSED' },
  ANC_POST_EDD: {
    visitFamily: 'ANC_POST_EDD',
    isHrVisit: false,
    escalationType: 'POST_EDD_MISSED',
  },
  PP: { visitFamily: 'PP', isHrVisit: false, escalationType: 'PP_MISSED' },
  // PP_HR/NN_HR are accepted here (and by VisitCodeType/scheduleMapper.ts)
  // so this job is ready the day rules-service's hr.rulesJson.ts starts
  // emitting them — it doesn't yet, so no PP_HR/NN_HR schedule exists for
  // this branch to actually reach today.
  PP_HR: { visitFamily: 'PP', isHrVisit: true, escalationType: 'PP_HR_MISSED' },
  NN: { visitFamily: 'NN', isHrVisit: false, escalationType: 'NN_MISSED' },
  NN_HR: { visitFamily: 'NN', isHrVisit: true, escalationType: 'NN_HR_MISSED' },
  INC: { visitFamily: 'INC', isHrVisit: false, escalationType: 'INC_2_MISSED' },
  INC_HR: { visitFamily: 'INC', isHrVisit: true, escalationType: 'INC_HR_MISSED' },
  CCV: { visitFamily: 'CCV', isHrVisit: false, escalationType: 'CCV_MISSED' },
  CCV_HR: { visitFamily: 'CCV', isHrVisit: true, escalationType: 'CCV_HR_MISSED' },
};

/** Counts the unbroken trailing run of MISSED among rows already ordered most-recent-first. */
export function countConsecutiveMissed(schedulesDesc: { status: string }[]): number {
  let count = 0;
  for (const schedule of schedulesDesc) {
    if (schedule.status !== 'MISSED') break;
    count++;
  }
  return count;
}

export interface MissedVisitJobDeps {
  prisma: PrismaService;
  escalationRuleSetId: string | undefined;
  getSystemToken: () => Promise<string>;
}

/**
 * One run of the missed-visit auto-transition/escalation job (SRS §3A.2.7
 * FR-S-7.1; "Missed visits + HR missed visits" and "Pending delivery form"
 * in the build plan — the latter rides this same job via the ANC_POST_EDD
 * visit family, per that item's own entry). Exported (not just scheduled)
 * so it can be invoked directly in a test or manually, without waiting for
 * node-cron's next tick.
 */
export async function runMissedVisitJob(deps: MissedVisitJobDeps): Promise<void> {
  const got = await acquireJobLock(deps.prisma, JOB_NAME, LOCK_DURATION_MS);
  if (!got) {
    console.log(`[${JOB_NAME}] Lock held by another run — skipping this tick.`);
    return;
  }

  const scheduleRepo = new VisitScheduleRepository(deps.prisma);
  const instanceRepo = new VisitInstanceRepository(deps.prisma);

  const now = new Date();
  const overdue = await scheduleRepo.findOverdueOpenSchedules(now, MAX_SCHEDULES_PER_TICK);
  if (overdue.length === 0) return;

  // A system-issued bearer token, forwarded as-is to every downstream
  // call this job makes — mirrors every *.client.ts's `authorizationHeader`
  // parameter, just backed by a machine identity instead of a human's.
  //
  // Both this and the MISSED lookup below are resolved once, up front, and
  // abort the whole tick on failure — rather than the previous behavior of
  // transitioning every schedule to MISSED regardless and silently skipping
  // the VisitInstance/escalation side effects for all of them. Aborting here
  // means none of this tick's schedules are touched yet (findOverdueOpenSchedules
  // hasn't been acted on), so the next tick simply retries the same set from
  // a clean slate instead of leaving 200 schedules permanently desynced.
  let authorizationHeader: string;
  try {
    authorizationHeader = `Bearer ${await deps.getSystemToken()}`;
  } catch (err) {
    console.error(`[${JOB_NAME}] Unable to mint a service token — skipping this tick:`, err);
    return;
  }

  let missedStatusLookupValueId: string;
  try {
    missedStatusLookupValueId = await resolveVisitStatusIdByCode('MISSED', authorizationHeader);
  } catch (err) {
    console.error(`[${JOB_NAME}] Unable to resolve the MISSED lookup value id:`, err);
    return;
  }

  for (const schedule of overdue) {
    let transitioned = false;
    try {
      transitioned = await scheduleRepo.markMissed(schedule.id);
      if (!transitioned) continue; // raced with another run/manual PATCH — already handled

      await instanceRepo.markMissedByScheduleId(
        schedule.id,
        missedStatusLookupValueId,
        SYSTEM_CALLER_ID,
      );
      await evaluateAndEscalate(schedule, scheduleRepo, deps, now, authorizationHeader);
    } catch (err) {
      // One beneficiary's bad data (e.g. an unmapped visitFamily, or
      // markMissed itself throwing) must not abort the rest of this tick's
      // batch, so the loop continues either way.
      console.error(`[${JOB_NAME}] Failed processing schedule ${schedule.id}:`, err);

      // Undo this tick's own MISSED transition so the schedule is eligible
      // for findOverdueOpenSchedules again next tick — without this, a
      // transient failure after markMissed already committed (VisitInstance
      // write, rules-service/beneficiary-service/auth-service blip) would
      // permanently drop the FR-S-7.1 escalation, since a MISSED schedule is
      // never revisited. Only needed once markMissed itself actually
      // succeeded — a throw from markMissed leaves nothing to revert.
      if (transitioned) {
        await scheduleRepo.revertToOpen(schedule.id).catch((revertErr) => {
          console.error(
            `[${JOB_NAME}] Failed to revert schedule ${schedule.id} back to OPEN — it will ` +
              'remain stuck MISSED without escalation until manually corrected:',
            revertErr,
          );
        });
      }
    }
  }
}

async function evaluateAndEscalate(
  schedule: { id: string; beneficiaryId: string; visitType: VisitCodeType },
  scheduleRepo: VisitScheduleRepository,
  deps: MissedVisitJobDeps,
  now: Date,
  authorizationHeader: string,
): Promise<void> {
  const mapping = VISIT_TYPE_ESCALATION[schedule.visitType];
  if (!mapping) return; // e.g. DELIVERY — see VISIT_TYPE_ESCALATION's doc comment
  if (!deps.escalationRuleSetId) return; // not yet provisioned — see app-config.ts's doc comment

  // *.client.ts calls in this job all take the raw (un-prefixed) token —
  // computed once here instead of re-deriving it at each call site below.
  const rawToken = authorizationHeader.replace(/^Bearer /, '');

  const recent = await scheduleRepo.findRecentByBeneficiaryAndVisitType(
    schedule.beneficiaryId,
    schedule.visitType,
    now,
  );
  const consecutiveMissedCount = countConsecutiveMissed(recent);

  const { shouldEscalate } = await evaluateEscalation(
    deps.escalationRuleSetId,
    { visitFamily: mapping.visitFamily, isHrVisit: mapping.isHrVisit, consecutiveMissedCount },
    authorizationHeader,
  );
  if (!shouldEscalate) return;

  const ownership = await findBeneficiaryOwnership(schedule.beneficiaryId, authorizationHeader);
  const sakhi = ownership ? await findSakhiById(ownership.sakhiId, authorizationHeader) : null;
  const supervisorId = sakhi?.supervisorId ?? null;

  const event = await createEscalationEvent(
    {
      beneficiaryId: schedule.beneficiaryId,
      escalationType: mapping.escalationType,
      visitId: schedule.id,
      visitsMissedCount: consecutiveMissedCount,
      assignedSupervisorId: supervisorId ?? undefined,
    },
    rawToken,
  );

  // Best-effort — the escalation event above is the durable record; a failed
  // push here is logged, not retried, and never fails the job run.
  if (supervisorId && event.status === 'OPEN') {
    try {
      // HR escalations get their own notificationType/body naming the
      // beneficiary and the miss count, per the HR-missed-visit escalation
      // spec — distinct from every other family's generic
      // MISSED_VISIT_ESCALATION. Both shapes funnel through the same single
      // createNotification call below instead of two near-duplicate ones.
      const notificationInput = mapping.isHrVisit
        ? {
            recipientUserId: supervisorId,
            notificationType: 'HR_MISSED_VISIT_ESCALATION',
            title: 'HR escalation — visit missed',
            body: await resolveHrNotificationBody(
              schedule.beneficiaryId,
              consecutiveMissedCount,
              authorizationHeader,
            ),
            priority: 8,
            linkedEntityType: 'ESCALATION_EVENT',
            linkedEntityId: event.id,
          }
        : {
            recipientUserId: supervisorId,
            notificationType: 'MISSED_VISIT_ESCALATION',
            title: 'A Sakhi has a missed-visit escalation requiring review',
            linkedEntityType: 'VISIT_SCHEDULE',
            linkedEntityId: schedule.id,
          };
      await createNotification(notificationInput, rawToken);
    } catch (err) {
      console.error(`[${JOB_NAME}] Escalation ${event.id} raised, notification failed:`, err);
    }
  }
}

/** Best-effort — a name lookup failure falls back to a generic HR notification body. */
async function resolveHrNotificationBody(
  beneficiaryId: string,
  consecutiveMissedCount: number,
  authorizationHeader: string,
): Promise<string> {
  const beneficiaryName = await resolveBeneficiaryName(beneficiaryId, authorizationHeader);
  return beneficiaryName
    ? `${beneficiaryName} has missed ${consecutiveMissedCount} consecutive visits — HR review required.`
    : `A beneficiary has missed ${consecutiveMissedCount} consecutive visits — HR review required.`;
}

/** Best-effort — a name lookup failure falls back to a generic notification
 * body rather than blocking the HR escalation it's attached to. */
async function resolveBeneficiaryName(
  beneficiaryId: string,
  authorizationHeader: string,
): Promise<string | null> {
  try {
    const beneficiary = await findBeneficiaryById(beneficiaryId, authorizationHeader);
    return beneficiary?.fullName ?? null;
  } catch (err) {
    console.error(`[${JOB_NAME}] Failed to resolve beneficiary ${beneficiaryId}'s name:`, err);
    return null;
  }
}

/** Wires the real dependencies and registers the node-cron schedule at boot. */
export function scheduleMissedVisitJob(
  prisma: PrismaService,
  cronExpression: string,
  escalationRuleSetId: string | undefined,
  clientId: string | undefined,
  clientSecret: string | undefined,
): void {
  const tokenClient =
    clientId && clientSecret ? new ServiceTokenClient(clientId, clientSecret) : null;

  cron.schedule(cronExpression, () => {
    void runMissedVisitJob({
      prisma,
      escalationRuleSetId,
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
