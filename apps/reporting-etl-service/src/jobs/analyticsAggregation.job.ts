import cron from 'node-cron';
import { acquireJobLock, ServiceTokenClient } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { AnalyticsEventClient } from '../analytics-client/analyticsEvent.client';
import { AggregatedMetricRepository } from '../metrics/aggregatedMetric.repository';
import { ENROLLMENT_FEATURE_AREA, computeEnrollmentMetrics } from '../metrics/enrollmentMetrics';

const JOB_NAME = 'analytics-metric-aggregation';
const LOCK_DURATION_MS = 25 * 60 * 1000; // aggregation over one day's events is expected to be fast

export interface AnalyticsAggregationJobDeps {
  prisma: PrismaService;
  getSystemToken: () => Promise<string>;
}

/**
 * One run of the SRS Sec 9.9 metric-aggregation job: pulls the prior
 * calendar day's raw analytics_events (from audit-service, via the gateway)
 * and computes that period's metrics, upserting into this service's
 * interim aggregated_metrics table (see AggregatedMetric's own schema
 * comment — a stand-in for the ClickHouse warehouse this SRS section
 * actually specifies, not provisioned anywhere in this codebase yet).
 *
 * Only ENROLLMENT is implemented so far — this is the end-to-end template
 * (ingest -> fetch -> aggregate -> store) the remaining 7 SRS feature areas
 * (Home Visit Forms, Health Education Messages, Referral, Visit Tracker and
 * Sakhi Dashboard, Closure and Reopen, Data Sync, Learn More) follow, each
 * as its own metrics module alongside enrollmentMetrics.ts.
 */
export async function runAnalyticsAggregationJob(deps: AnalyticsAggregationJobDeps): Promise<void> {
  const got = await acquireJobLock(deps.prisma, JOB_NAME, LOCK_DURATION_MS);
  if (!got) {
    console.log(`[${JOB_NAME}] Lock held by another run — skipping this tick.`);
    return;
  }

  let authorizationHeader: string;
  try {
    authorizationHeader = `Bearer ${await deps.getSystemToken()}`;
  } catch (err) {
    console.error(`[${JOB_NAME}] Unable to mint a service token — skipping this tick:`, err);
    return;
  }

  // The prior full calendar day, UTC — a stable, re-runnable window (unlike
  // "last 24 hours from now," which would shift on every tick and produce a
  // different aggregated_metrics row each run instead of upserting the same
  // one).
  const now = new Date();
  const periodStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1),
  );
  const periodEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const analyticsClient = new AnalyticsEventClient();
  const metricRepo = new AggregatedMetricRepository(deps.prisma);

  try {
    const events = await analyticsClient.listAll(
      ENROLLMENT_FEATURE_AREA,
      periodStart,
      periodEnd,
      authorizationHeader,
    );
    const metrics = computeEnrollmentMetrics(events);

    await metricRepo.upsert({
      featureArea: ENROLLMENT_FEATURE_AREA,
      metricName: 'DROP_OFF_RATE',
      periodStart,
      periodEnd,
      value: metrics.dropOffRate,
    });
    await metricRepo.upsert({
      featureArea: ENROLLMENT_FEATURE_AREA,
      metricName: 'AVERAGE_FORM_COMPLETION_TIME_MS',
      periodStart,
      periodEnd,
      value: metrics.averageFormCompletionTimeMs,
    });
    await metricRepo.upsert({
      featureArea: ENROLLMENT_FEATURE_AREA,
      metricName: 'ENROLLMENTS_PER_SAKHI',
      periodStart,
      periodEnd,
      breakdownJson: Object.fromEntries(metrics.enrollmentsPerSakhi),
    });
  } catch (err) {
    // One feature area's failure must not be a hard job failure — the next
    // feature area (once implemented) should still get a chance to run.
    console.error(`[${JOB_NAME}] Failed aggregating ${ENROLLMENT_FEATURE_AREA}:`, err);
  }
}

/** Wires the real dependencies and registers the node-cron schedule at boot. */
export function scheduleAnalyticsAggregationJob(
  prisma: PrismaService,
  cronExpression: string,
  clientId: string | undefined,
  clientSecret: string | undefined,
): void {
  const tokenClient =
    clientId && clientSecret ? new ServiceTokenClient(clientId, clientSecret) : null;

  cron.schedule(cronExpression, () => {
    void runAnalyticsAggregationJob({
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
