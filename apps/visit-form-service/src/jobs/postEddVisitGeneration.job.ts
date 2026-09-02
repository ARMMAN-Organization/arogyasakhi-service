import cron from 'node-cron';
import { acquireJobLock, ServiceTokenClient } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { VisitScheduleRepository } from '../visit-schedules/visitSchedule.repository';
import { VisitScheduleService } from '../visit-schedules/visitSchedule.service';
import {
  findPostEddPendingBeneficiaries,
  type PostEddPendingBeneficiary,
} from '../beneficiaries/beneficiary.client';

const JOB_NAME = 'post-edd-visit-generation';
const LOCK_DURATION_MS = 20 * 60 * 1000; // well under the default once-a-day cadence
const PAGE_SIZE = 200;
const MAX_PAGES_PER_TICK = 1000; // safety valve — a real backlog this large just spills to the next tick
// SRS SR-ANC-01/BR-08: the delivery-form-pending window opens once EDD+7 has
// passed with no delivery outcome recorded.
const EDD_GRACE_DAYS = 7;
// This job has no human identity — SYSTEM is the same service-token role
// missedVisit.job.ts's downstream calls (createEscalationEvent/
// createNotification) and this repo's other background jobs already use.
const SYSTEM_CALLER = { id: 'post-edd-visit-generation-job', roles: ['SYSTEM'] };
// visitCode format is `${visitCodePrefix}${sequenceNo}` (scheduleMapper.ts's
// toRow) — ANC_POST_EDD's postEddVisit is always sequenceNo 1.
const ANC_POST_EDD_VISIT_CODE = 'ANC_POST_EDD1';

/** Formats an ISO datetime/date string as the YYYY-MM-DD date-only string generateSchedule's DTO expects. */
function toDateOnlyString(isoDate: string): string {
  return isoDate.slice(0, 10);
}

export interface PostEddVisitGenerationJobDeps {
  prisma: PrismaService;
  getSystemToken: () => Promise<string>;
}

/**
 * One run of the post-EDD visit-generation job (build plan: "EDD+7
 * delivery-form check" + "Auto-generate ANC(n+1) visit"). Finds MOTHER
 * beneficiaries whose EDD+7 has passed with no delivery outcome submitted
 * yet (beneficiary-service's GET /beneficiaries/internal/post-edd-pending),
 * and — for any that don't already have one — generates their ANC_POST_EDD
 * visit schedule (window EDD+8 to EDD+13) by calling
 * VisitScheduleService.generateSchedule in-process, the same path
 * POST /visit-schedules/generate uses for a human-triggered regeneration.
 * Once that schedule exists, missedVisit.job.ts's existing ANC_POST_EDD ->
 * POST_EDD_MISSED handling (immediate, 1-miss escalation) takes over
 * unchanged — this job's only job is making sure the visit gets created.
 */
export async function runPostEddVisitGenerationJob(
  deps: PostEddVisitGenerationJobDeps,
): Promise<void> {
  const got = await acquireJobLock(deps.prisma, JOB_NAME, LOCK_DURATION_MS);
  if (!got) {
    console.log(`[${JOB_NAME}] Lock held by another run — skipping this tick.`);
    return;
  }

  const scheduleRepo = new VisitScheduleRepository(deps.prisma);
  const scheduleService = new VisitScheduleService(scheduleRepo);

  const cutoffDate = new Date(Date.now() - EDD_GRACE_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES_PER_TICK; page++) {
    // Minted fresh per page (ServiceTokenClient caches internally and only
    // re-mints once the cached token is within 30s of expiry — see
    // ServiceTokenClient.getToken) so a run long enough to outlive one
    // token's TTL keeps working instead of failing partway through.
    let authorizationHeader: string;
    try {
      authorizationHeader = `Bearer ${await deps.getSystemToken()}`;
    } catch (err) {
      console.error(`[${JOB_NAME}] Unable to mint a service token — stopping this tick:`, err);
      return;
    }

    let result;
    try {
      result = await findPostEddPendingBeneficiaries(
        cutoffDate,
        PAGE_SIZE,
        cursor,
        authorizationHeader,
      );
    } catch (err) {
      // Stop rather than throw: cursor is local to this call, so a future
      // tick can only resume from page 1 either way — better to keep
      // whatever pages already succeeded this tick than to lose them to an
      // uncaught rejection propagating out of runPostEddVisitGenerationJob.
      console.error(`[${JOB_NAME}] Failed fetching page ${page} — stopping this tick:`, err);
      return;
    }

    for (const candidate of result.items) {
      try {
        await generateIfMissing(candidate, scheduleRepo, scheduleService, authorizationHeader);
      } catch (err) {
        // One beneficiary's bad data must not abort the rest of this tick's
        // batch — same resilience stance as missedVisit.job.ts.
        console.error(
          `[${JOB_NAME}] Failed processing beneficiary ${candidate.beneficiaryId}:`,
          err,
        );
      }
    }

    if (!result.nextCursor) return;
    cursor = result.nextCursor;
  }
}

/** Generates a beneficiary's ANC_POST_EDD schedule unless one already exists. */
async function generateIfMissing(
  candidate: PostEddPendingBeneficiary,
  scheduleRepo: VisitScheduleRepository,
  scheduleService: VisitScheduleService,
  authorizationHeader: string,
): Promise<void> {
  const existing = await scheduleRepo.findByBeneficiaryAndVisitCodes(candidate.beneficiaryId, [
    ANC_POST_EDD_VISIT_CODE,
  ]);
  if (existing.length > 0) return;

  await scheduleService.generateSchedule(
    {
      beneficiaryId: candidate.beneficiaryId,
      scheduleKind: 'ANC',
      registrationDate: toDateOnlyString(candidate.registrationDate),
      edd: toDateOnlyString(candidate.eddDate),
      // Guaranteed by the post-edd-pending query itself: it only returns
      // beneficiaries still in the ANC phase, i.e. no delivery outcome (and
      // so no delivery form) has been recorded yet.
      deliveryFormFiledDate: null,
    },
    SYSTEM_CALLER,
    authorizationHeader,
  );
}

/** Wires the real dependencies and registers the node-cron schedule at boot. */
export function schedulePostEddVisitGenerationJob(
  prisma: PrismaService,
  cronExpression: string,
  clientId: string | undefined,
  clientSecret: string | undefined,
): void {
  const tokenClient =
    clientId && clientSecret ? new ServiceTokenClient(clientId, clientSecret) : null;

  cron.schedule(cronExpression, () => {
    void runPostEddVisitGenerationJob({
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
