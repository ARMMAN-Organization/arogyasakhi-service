import { ZenDecisionContent, ZenEngine } from '@gorules/zen-engine';
import { badRequest } from '@armman/service-commons';

/**
 * The seven scheduling journeys this evaluator knows how to shape-validate.
 * Unlike ruleSet.evaluator.ts's single RISK contract, each scheduling
 * journey has its own output shape (SRS §3A.2.3, Appendix A/B/G) — the
 * caller must say which one it's evaluating (derived from the RuleSet's own
 * ruleSetName/category, not guessed from the output), because a
 * malformed/wrong-shaped output must fail closed rather than partially
 * match a different journey's schema.
 */
export const SCHEDULE_KINDS = ['ANC', 'PP', 'NN', 'INC', 'CCV', 'HR', 'DELIVERY'] as const;
export type ScheduleKind = (typeof SCHEDULE_KINDS)[number];

interface VisitWindow {
  visitName: string;
  scheduledDate: string;
  windowOpen: string;
  windowClose: string;
}

/**
 * Runs a published SCHEDULE rule version's gorules decision graph against
 * `input` and returns its shape-validated result. Same execution pattern as
 * ruleSet.evaluator.ts's evaluateRulePack — fresh ZenEngine/ZenDecisionContent
 * per call, badRequest() on a malformed decision-graph output — but with a
 * per-`scheduleKind` output contract instead of one shared RISK shape.
 */
export async function evaluateSchedulePack(
  scheduleKind: ScheduleKind,
  rulesJson: unknown,
  input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const engine = new ZenEngine();
  const content = new ZenDecisionContent(rulesJson as object);
  const decision = engine.createDecision(content);
  let response;
  try {
    response = await decision.evaluate(input);
  } finally {
    engine.dispose();
  }

  const result = response.result;
  if (typeof result !== 'object' || result === null) {
    throw badRequest(`This ${scheduleKind} rule pack's decision graph did not return an object.`);
  }
  const r = result as Record<string, unknown>;

  switch (scheduleKind) {
    case 'ANC':
      return validateAnc(r);
    case 'PP':
      return validatePp(r);
    case 'NN':
      return validateNn(r);
    case 'INC':
      return validateInc(r);
    case 'CCV':
      return validateCcv(r);
    case 'HR':
      return validateHr(r);
    case 'DELIVERY':
      return validateDelivery(r);
  }
}

function isString(v: unknown): v is string {
  return typeof v === 'string';
}

/**
 * zen-engine's function-node result serialization drops keys whose value is
 * `null` from the returned object entirely (observed empirically — a
 * function node's `return { foo: null }` comes back as `{}`, not
 * `{ foo: null }`), so an absent optional field and an explicit null are
 * indistinguishable from the engine's output and must be treated the same
 * by every optional-field check below.
 */
function isAbsentOrNull(v: unknown): boolean {
  return v === null || v === undefined;
}

/** Validates an optional visit-window field, normalising "absent" to null. */
function validateOptionalVisitWindow(v: unknown, path: string): VisitWindow | null {
  return isAbsentOrNull(v) ? null : validateVisitWindow(v, path);
}

function validateVisitWindow(v: unknown, path: string): VisitWindow {
  if (typeof v !== 'object' || v === null) {
    throw badRequest(`${path} must be an object.`);
  }
  const o = v as Record<string, unknown>;
  if (!isString(o.visitName)) throw badRequest(`${path}.visitName must be a string.`);
  if (!isString(o.scheduledDate)) throw badRequest(`${path}.scheduledDate must be a string.`);
  if (!isString(o.windowOpen)) throw badRequest(`${path}.windowOpen must be a string.`);
  if (!isString(o.windowClose)) throw badRequest(`${path}.windowClose must be a string.`);
  return {
    visitName: o.visitName,
    scheduledDate: o.scheduledDate,
    windowOpen: o.windowOpen,
    windowClose: o.windowClose,
  };
}

function validateVisitArray(v: unknown, path: string): VisitWindow[] {
  if (!Array.isArray(v)) throw badRequest(`${path} must be an array.`);
  return v.map((entry, i) => validateVisitWindow(entry, `${path}[${i}]`));
}

function validateAnc(r: Record<string, unknown>) {
  if (typeof r.totalRegularVisits !== 'number') {
    throw badRequest('ANC output must include a numeric totalRegularVisits.');
  }
  const visits = validateVisitArray(r.visits, 'visits');
  const postEddVisit = validateOptionalVisitWindow(r.postEddVisit, 'postEddVisit');
  if (typeof r.deliveryFormFiledByEddPlus7 !== 'boolean') {
    throw badRequest('ANC output must include a boolean deliveryFormFiledByEddPlus7.');
  }
  return { ...r, visits, postEddVisit };
}

function validatePp(r: Record<string, unknown>) {
  const visits = validateVisitArray(r.visits, 'visits');
  if (visits.length !== 5) {
    throw badRequest('PP output must contain exactly 5 visits (PP1-PP5).');
  }
  return { ...r, visits };
}

function validateNn(r: Record<string, unknown>) {
  if (typeof r.scenario !== 'string') throw badRequest('NN output must include a scenario string.');
  if (typeof r.neonatalPhaseApplies !== 'boolean') {
    throw badRequest('NN output must include a boolean neonatalPhaseApplies.');
  }
  const nn1 = validateOptionalVisitWindow(r.nn1, 'nn1');
  const nn2 = validateOptionalVisitWindow(r.nn2, 'nn2');
  return { ...r, nn1, nn2 };
}

function validateInc(r: Record<string, unknown>) {
  if (r.registrationCategory !== 'EARLY' && r.registrationCategory !== 'LATE') {
    throw badRequest("INC output's registrationCategory must be 'EARLY' or 'LATE'.");
  }
  const visits = validateVisitArray(r.visits, 'visits');
  if (!Array.isArray(r.droppedVisits) || !r.droppedVisits.every(isString)) {
    throw badRequest('INC output must include droppedVisits as an array of strings.');
  }
  return { ...r, visits };
}

const CCV_RISK_STATES = [
  'NEVER_AT_HR',
  'CURRENTLY_HR_SAM',
  'CURRENTLY_HR_OTHER',
  'RECENTLY_RECOVERED',
  'STABLE_LOW_RISK',
] as const;

function validateCcv(r: Record<string, unknown>) {
  if (!CCV_RISK_STATES.includes(r.riskState as (typeof CCV_RISK_STATES)[number])) {
    throw badRequest(`CCV output's riskState must be one of ${CCV_RISK_STATES.join(', ')}.`);
  }
  if (typeof r.cadence13to18MonthsEveryNMonths !== 'number') {
    throw badRequest('CCV output must include a numeric cadence13to18MonthsEveryNMonths.');
  }
  if (typeof r.cadence19to24MonthsEveryNMonths !== 'number') {
    throw badRequest('CCV output must include a numeric cadence19to24MonthsEveryNMonths.');
  }
  const visits = validateVisitArray(r.visits, 'visits');
  const extensionVisit = validateOptionalVisitWindow(r.extensionVisit, 'extensionVisit');
  if (typeof r.closureDeferredForExtension !== 'boolean') {
    throw badRequest('CCV output must include a boolean closureDeferredForExtension.');
  }
  return { ...r, visits, extensionVisit };
}

function validateHr(r: Record<string, unknown>) {
  if (typeof r.generateHrVisit !== 'boolean') {
    throw badRequest('HR output must include a boolean generateHrVisit.');
  }
  if (typeof r.cumulative !== 'boolean') {
    throw badRequest('HR output must include a boolean cumulative.');
  }
  const hrVisit = validateOptionalVisitWindow(r.hrVisit, 'hrVisit');
  return { ...r, hrVisit };
}

function validateDelivery(r: Record<string, unknown>) {
  if (typeof r.motherPlan !== 'object' || r.motherPlan === null) {
    throw badRequest('DELIVERY output must include a motherPlan object.');
  }
  const motherPlan = r.motherPlan as Record<string, unknown>;
  if (typeof motherPlan.generatePpSchedule !== 'boolean') {
    throw badRequest('DELIVERY output motherPlan.generatePpSchedule must be a boolean.');
  }
  if (motherPlan.ppScheduleStartsFrom !== 'PP1' && motherPlan.ppScheduleStartsFrom !== 'PP2') {
    throw badRequest("DELIVERY output motherPlan.ppScheduleStartsFrom must be 'PP1' or 'PP2'.");
  }
  if (typeof motherPlan.lapseOpenAncVisits !== 'boolean') {
    throw badRequest('DELIVERY output motherPlan.lapseOpenAncVisits must be a boolean.');
  }
  if (!Array.isArray(r.childPlans)) {
    throw badRequest('DELIVERY output must include childPlans as an array.');
  }
  r.childPlans.forEach((plan, i) => {
    if (typeof plan !== 'object' || plan === null) {
      throw badRequest(`DELIVERY output childPlans[${i}] must be an object.`);
    }
    const p = plan as Record<string, unknown>;
    if (typeof p.childIndex !== 'number') {
      throw badRequest(`DELIVERY output childPlans[${i}].childIndex must be a number.`);
    }
    if (typeof p.generateNnSchedule !== 'boolean') {
      throw badRequest(`DELIVERY output childPlans[${i}].generateNnSchedule must be a boolean.`);
    }
    if (typeof p.generateIncSchedule !== 'boolean') {
      throw badRequest(`DELIVERY output childPlans[${i}].generateIncSchedule must be a boolean.`);
    }
  });
  if (typeof r.neonatalPhaseAppliesGlobally !== 'boolean') {
    throw badRequest('DELIVERY output must include a boolean neonatalPhaseAppliesGlobally.');
  }
  return r;
}
