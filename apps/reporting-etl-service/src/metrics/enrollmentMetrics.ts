import type { AnalyticsEventRecord } from '../analytics-client/analyticsEvent.client';

export const ENROLLMENT_FEATURE_AREA = 'ENROLLMENT';

/** Event names this feature area's metrics are computed from — the mobile
 * app's own instrumentation contract (not yet built; see this module's
 * header comment in the job file for scope). */
export const ENROLLMENT_EVENT_NAMES = {
  FORM_OPEN: 'FORM_OPEN',
  FORM_SUBMIT: 'FORM_SUBMIT',
} as const;

export interface EnrollmentMetrics {
  /** Formula: (Started − Submitted) / Started. Null when zero forms were started. */
  dropOffRate: number | null;
  /** Average ms from FORM_OPEN to FORM_SUBMIT, per Sakhi+form session (matched by
   * payloadJson.sessionId). Null when no session has both events. */
  averageFormCompletionTimeMs: number | null;
  /** Count of FORM_SUBMIT events, grouped by sakhiUserId. */
  enrollmentsPerSakhi: Map<string, number>;
}

/**
 * Computes SRS Sec 9.1 Enrollment metrics (Performance/Usage categories —
 * only the 3 formulas above are implemented so far, as the template for the
 * remaining ~12 Enrollment metrics and the other 7 feature areas) from one
 * window's worth of raw events. Pure function — no I/O, so it's trivially
 * unit-testable against hand-built event fixtures.
 *
 * Session matching (for completion time) relies on the mobile app tagging
 * both FORM_OPEN and FORM_SUBMIT with the same `payloadJson.sessionId` —
 * this is a contract with the (not-yet-built) mobile instrumentation, not
 * something this function can enforce; an event missing sessionId is
 * excluded from the completion-time calculation but still counted for
 * drop-off rate and per-Sakhi counts.
 */
export function computeEnrollmentMetrics(events: AnalyticsEventRecord[]): EnrollmentMetrics {
  const opens = events.filter((e) => e.eventName === ENROLLMENT_EVENT_NAMES.FORM_OPEN);
  const submits = events.filter((e) => e.eventName === ENROLLMENT_EVENT_NAMES.FORM_SUBMIT);

  const dropOffRate = opens.length > 0 ? (opens.length - submits.length) / opens.length : null;

  const opensBySession = new Map<string, AnalyticsEventRecord>();
  for (const open of opens) {
    const sessionId = sessionIdOf(open);
    if (sessionId) opensBySession.set(sessionId, open);
  }
  const completionTimesMs: number[] = [];
  for (const submit of submits) {
    const sessionId = sessionIdOf(submit);
    const open = sessionId ? opensBySession.get(sessionId) : undefined;
    if (open) {
      const deltaMs = new Date(submit.occurredAt).getTime() - new Date(open.occurredAt).getTime();
      if (deltaMs >= 0) completionTimesMs.push(deltaMs);
    }
  }
  const averageFormCompletionTimeMs =
    completionTimesMs.length > 0
      ? completionTimesMs.reduce((a, b) => a + b, 0) / completionTimesMs.length
      : null;

  const enrollmentsPerSakhi = new Map<string, number>();
  for (const submit of submits) {
    if (!submit.sakhiUserId) continue;
    enrollmentsPerSakhi.set(
      submit.sakhiUserId,
      (enrollmentsPerSakhi.get(submit.sakhiUserId) ?? 0) + 1,
    );
  }

  return { dropOffRate, averageFormCompletionTimeMs, enrollmentsPerSakhi };
}

function sessionIdOf(event: AnalyticsEventRecord): string | undefined {
  const payload = event.payloadJson;
  if (typeof payload === 'object' && payload !== null && 'sessionId' in payload) {
    const value = (payload as { sessionId?: unknown }).sessionId;
    return typeof value === 'string' ? value : undefined;
  }
  return undefined;
}
