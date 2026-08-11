import { randomUUID } from 'node:crypto';
import { evaluateScheduleRulePack, runDecisionGraph, type ScheduleRow } from './ruleSet.evaluator';

/**
 * Drives the COMBINED_SCHEDULE_DECISION_GRAPH (or any SCHEDULE rule pack
 * with the same visitFamily/mode contract) across every candidate visit for
 * one beneficiary, assembling the full schedule array visit-form-service's
 * bulkScheduleRowSchema expects (create-visit-schedule-bulk.dto.ts).
 *
 * The loop itself — "keep asking the graph for the next visit until it says
 * stop" — is plain TypeScript; every date/window/threshold used to answer
 * that question comes from the decision graph (see anc.graph.ts /
 * inc.graph.ts), matching the SRS's "config-driven rules, no hardcoded
 * logic" mandate for the business content, not the iteration mechanics.
 */

const MAX_ANC_VISITS_SAFETY_CAP = 20;
const MAX_INC_VISITS_SAFETY_CAP = 15;
const MAX_CCV_VISITS_SAFETY_CAP = 12;

const CCV_AGE_BAND_BOUNDARY_MONTHS = 18;

/**
 * ANC schedule: visit count from the formula, ANC1, then ANC2..N chained
 * every 30 days. Does not include ANC-HR (triggered separately, on-demand,
 * anchored to an actual visit completion — see generateAncHrVisit) or the
 * SR-ANC-01 post-EDD visit (also on-demand — see generateAncPostEddVisit).
 */
export async function generateAncSchedule(
  rulesJson: unknown,
  input: { registrationDate: string; edd: string },
): Promise<ScheduleRow[]> {
  const countResult = await evaluateScheduleGraphMode(rulesJson, 'ANC', {
    mode: 'VISIT_COUNT',
    registrationDate: input.registrationDate,
    edd: input.edd,
  });
  const visitCount = Math.min(
    (countResult as { visitCount: number }).visitCount,
    MAX_ANC_VISITS_SAFETY_CAP,
  );

  const anc1 = await evaluateScheduleRulePack(rulesJson, {
    visitFamily: 'ANC',
    mode: 'ANC1',
    registrationDate: input.registrationDate,
    edd: input.edd,
    localScheduleUuid: randomUUID(),
  });
  const rows = [...anc1.scheduleRows];

  for (let sequenceNo = 2; sequenceNo <= visitCount; sequenceNo += 1) {
    const previous = rows[rows.length - 1];
    const next = await evaluateScheduleRulePack(rulesJson, {
      visitFamily: 'ANC',
      mode: 'CHAINED',
      previousScheduledDate: previous.scheduledDate,
      sequenceNo,
      localScheduleUuid: randomUUID(),
      previousVisitLocalUuid: previous.localScheduleUuid,
    });
    rows.push(...next.scheduleRows);
  }

  return rows;
}

/** ANC-HR: one on-demand call, anchored to the actual completion date of the triggering visit. */
export async function generateAncHrVisit(
  rulesJson: unknown,
  input: { actualCompletionDate: string; sequenceNo: number; triggeringVisitLocalUuid: string },
): Promise<ScheduleRow[]> {
  const result = await evaluateScheduleRulePack(rulesJson, {
    visitFamily: 'ANC',
    mode: 'HR',
    actualCompletionDate: input.actualCompletionDate,
    sequenceNo: input.sequenceNo,
    localScheduleUuid: randomUUID(),
    triggeringVisitLocalUuid: input.triggeringVisitLocalUuid,
  });
  return result.scheduleRows;
}

/** SR-ANC-01: one on-demand call, only generates a row once the grace period has elapsed. */
export async function generateAncPostEddVisit(
  rulesJson: unknown,
  input: {
    edd: string;
    deliveryFormFiled: boolean;
    daysSinceEdd: number;
    totalRegularAncVisits: number;
  },
): Promise<ScheduleRow[]> {
  const result = await evaluateScheduleRulePack(rulesJson, {
    visitFamily: 'ANC',
    mode: 'POST_EDD',
    edd: input.edd,
    deliveryFormFiled: input.deliveryFormFiled,
    daysSinceEdd: input.daysSinceEdd,
    totalRegularAncVisits: input.totalRegularAncVisits,
    localScheduleUuid: randomUUID(),
  });
  return result.scheduleRows;
}

/** PP schedule: fixed PP1..PP5, one call per visit code, no chaining/looping needed. */
export async function generatePpSchedule(
  rulesJson: unknown,
  input: { deliveryDate: string },
): Promise<ScheduleRow[]> {
  const rows: ScheduleRow[] = [];
  for (const visitCode of ['PP1', 'PP2', 'PP3', 'PP4', 'PP5']) {
    const result = await evaluateScheduleRulePack(rulesJson, {
      visitFamily: 'PP',
      visitCode,
      deliveryDate: input.deliveryDate,
      localScheduleUuid: randomUUID(),
    });
    rows.push(...result.scheduleRows);
  }
  return rows;
}

/** NN schedule: one call — the graph itself returns 1 or 2 rows depending on scenario A/B/C. */
export async function generateNnSchedule(
  rulesJson: unknown,
  input: { deliveryDate: string; deliveryFormFilledDay: number },
): Promise<ScheduleRow[]> {
  const result = await evaluateScheduleRulePack(rulesJson, {
    visitFamily: 'NN',
    deliveryDate: input.deliveryDate,
    deliveryFormFilledDay: input.deliveryFormFilledDay,
    localScheduleUuid1: randomUUID(),
    localScheduleUuid2: randomUUID(),
  });
  return result.scheduleRows;
}

/**
 * INC schedule: PLAN determines the early/late branch, INC1 date, and visit
 * count; CHAINED is then called per remaining visit index, stopping either
 * at the computed count or as soon as the hard DOB+370 cutoff drops a row
 * (whichever comes first) — a dropped visit is never generated, per SRS.
 */
export async function generateIncSchedule(
  rulesJson: unknown,
  input: { dob: string; registrationDate: string; registrationDaysFromDob: number },
): Promise<ScheduleRow[]> {
  const plan = (await evaluateScheduleGraphMode(rulesJson, 'INC', {
    mode: 'PLAN',
    dob: input.dob,
    registrationDate: input.registrationDate,
    registrationDaysFromDob: input.registrationDaysFromDob,
  })) as { branch: string; visitCount: number; inc1Date: string };

  const visitCount = Math.min(plan.visitCount, MAX_INC_VISITS_SAFETY_CAP);
  const inc1: ScheduleRow = {
    localScheduleUuid: randomUUID(),
    visitCode: 'INC1',
    visitType: 'INC',
    sequenceNo: 1,
    scheduledDate: plan.inc1Date,
    windowStartDate: plan.inc1Date,
    windowEndDate: plan.inc1Date,
    anchorType: plan.branch === 'early' ? 'DOB' : 'REGISTRATION',
    anchorVisitLocalUuid: null,
  };
  const rows = [inc1];

  for (let sequenceNo = 2; sequenceNo <= visitCount; sequenceNo += 1) {
    const previous = rows[rows.length - 1];
    const result = await evaluateScheduleRulePack(rulesJson, {
      visitFamily: 'INC',
      mode: 'CHAINED',
      dob: input.dob,
      previousScheduledDate: previous.scheduledDate,
      sequenceNo,
      localScheduleUuid: randomUUID(),
      previousVisitLocalUuid: previous.localScheduleUuid,
    });
    if (result.scheduleRows.length === 0) break; // hard cutoff reached — stop, don't mark missed
    rows.push(...result.scheduleRows);
  }

  return rows;
}

/** INC-HR: one on-demand call, same pattern as ANC-HR. */
export async function generateIncHrVisit(
  rulesJson: unknown,
  input: {
    dob: string;
    actualCompletionDate: string;
    sequenceNo: number;
    triggeringVisitLocalUuid: string;
  },
): Promise<ScheduleRow[]> {
  const result = await evaluateScheduleRulePack(rulesJson, {
    visitFamily: 'INC',
    mode: 'HR',
    dob: input.dob,
    actualCompletionDate: input.actualCompletionDate,
    sequenceNo: input.sequenceNo,
    localScheduleUuid: randomUUID(),
    triggeringVisitLocalUuid: input.triggeringVisitLocalUuid,
  });
  return result.scheduleRows;
}

/**
 * CCV schedule: RISK_STATE once (from the caller-supplied last-3-INC-visit
 * flags) determines the 13-18m and 19-24m cadence, then CADENCE is chained
 * from the INC-to-CCV transition point, switching cadence at the 18-month
 * boundary, through the 24-month (DOB+730) exit point.
 *
 * Generates only up to 24m — the 25m CCV-HR extension (SRS: "if HR detected
 * at the last CCV visit, journey extends") is NOT generated here, since
 * whether the last visit had HR isn't known until that visit is actually
 * conducted. That extension is handled the same way every other HR visit in
 * this codebase is: on-demand, via generateCcvHrVisit, once a real visit's
 * outcome triggers it.
 */
export async function generateCcvSchedule(
  rulesJson: unknown,
  input: {
    dob: string;
    transitionDate: string;
    hadAnyHrInLast12m: boolean;
    mostRecentHasSamOrDangerSign: boolean;
    mostRecentHasOtherHr: boolean;
    last3AllAtRisk: boolean;
    last3AllNormalFullyImmunised: boolean;
  },
): Promise<ScheduleRow[]> {
  const riskState = (await evaluateScheduleGraphMode(rulesJson, 'CCV', {
    mode: 'RISK_STATE',
    hadAnyHrInLast12m: input.hadAnyHrInLast12m,
    mostRecentHasSamOrDangerSign: input.mostRecentHasSamOrDangerSign,
    mostRecentHasOtherHr: input.mostRecentHasOtherHr,
    last3AllAtRisk: input.last3AllAtRisk,
    last3AllNormalFullyImmunised: input.last3AllNormalFullyImmunised,
  })) as { riskState: string; cadence18mMonths: number; cadence24mMonths: number };

  const exit = (await evaluateScheduleGraphMode(rulesJson, 'CCV', {
    mode: 'EXIT',
    dob: input.dob,
    hrAtLastVisit: false,
  })) as { exitDate: string };

  const rows: ScheduleRow[] = [];
  let previousScheduledDate = input.transitionDate;
  let previousLocalUuid: string | null = null;
  let ageInMonths = monthsBetween(input.dob, input.transitionDate);

  for (let sequenceNo = 1; sequenceNo <= MAX_CCV_VISITS_SAFETY_CAP; sequenceNo += 1) {
    const cadenceMonths =
      ageInMonths <= CCV_AGE_BAND_BOUNDARY_MONTHS
        ? riskState.cadence18mMonths
        : riskState.cadence24mMonths;

    const localScheduleUuid = randomUUID();
    const result = await evaluateScheduleRulePack(rulesJson, {
      visitFamily: 'CCV',
      mode: 'CADENCE',
      previousScheduledDate,
      cadenceMonths,
      sequenceNo,
      localScheduleUuid,
      anchorVisitLocalUuid: previousLocalUuid,
    });

    const row = result.scheduleRows[0];
    if (!row || row.scheduledDate > exit.exitDate) break; // reached the 24-month exit point — stop

    rows.push(row);
    previousScheduledDate = row.scheduledDate;
    previousLocalUuid = row.localScheduleUuid;
    ageInMonths = monthsBetween(input.dob, row.scheduledDate);
  }

  return rows;
}

/** Whole calendar months between two YYYY-MM-DD dates (dob -> the given date). */
function monthsBetween(dob: string, date: string): number {
  const [dobYear, dobMonth, dobDay] = dob.split('-').map(Number);
  const [dateYear, dateMonth, dateDay] = date.split('-').map(Number);
  let months = (dateYear - dobYear) * 12 + (dateMonth - dobMonth);
  if (dateDay < dobDay) months -= 1;
  return months;
}

/**
 * CCV-HR: one on-demand call per detection — single-instance, no dedup
 * against past detections (SRS: a fresh HR visit generates every time,
 * even for a condition triggered before).
 */
export async function generateCcvHrVisit(
  rulesJson: unknown,
  input: { actualDetectionDate: string; sequenceNo: number; triggeringVisitLocalUuid: string },
): Promise<ScheduleRow[]> {
  const result = await evaluateScheduleRulePack(rulesJson, {
    visitFamily: 'CCV',
    mode: 'HR',
    actualDetectionDate: input.actualDetectionDate,
    sequenceNo: input.sequenceNo,
    localScheduleUuid: randomUUID(),
    triggeringVisitLocalUuid: input.triggeringVisitLocalUuid,
  });
  return result.scheduleRows;
}

/**
 * Runs the combined graph in a mode where the immediate result isn't itself
 * a `{ scheduleRows }` object (VISIT_COUNT and INC's PLAN return plain
 * summary objects) — bypasses evaluateScheduleRulePack's scheduleRows-shape
 * validation, which doesn't apply to these two intermediate calls.
 */
function evaluateScheduleGraphMode(
  rulesJson: unknown,
  visitFamily: 'ANC' | 'INC' | 'CCV',
  rest: Record<string, unknown>,
): Promise<unknown> {
  return runDecisionGraph(rulesJson, { visitFamily, ...rest });
}
