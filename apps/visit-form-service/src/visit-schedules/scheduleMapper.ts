import { badRequest } from '@armman/service-commons';
import type { BulkScheduleRow } from './dto/create-visit-schedule-bulk.dto';
import type { GeneratableScheduleKind } from './dto/generate-visit-schedule.dto';

interface RuleVisitWindow {
  visitName: string;
  scheduledDate: string;
  windowOpen: string;
  windowClose: string;
}

function isRuleVisitWindow(v: unknown): v is RuleVisitWindow {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as RuleVisitWindow).visitName === 'string' &&
    typeof (v as RuleVisitWindow).scheduledDate === 'string' &&
    typeof (v as RuleVisitWindow).windowOpen === 'string' &&
    typeof (v as RuleVisitWindow).windowClose === 'string'
  );
}

/**
 * Builds one BulkScheduleRow from a rule pack's VisitWindow. `visitCode` is
 * `${prefix}${sequenceNo}` (e.g. "ANC3") to satisfy visitSchedule.service.ts's
 * trailingSequenceNo check; `localScheduleUuid` is a deterministic string
 * (not a random uuid) so re-running /generate for the same beneficiary+kind
 * produces the exact same uuids every time — required for the existing
 * bulk-persistence path's own idempotency-by-localScheduleUuid check to
 * recognise a retry rather than mistake it for new rows.
 */
function toRow(
  beneficiaryId: string,
  visitCodePrefix: string,
  visitType: BulkScheduleRow['visitType'],
  sequenceNo: number,
  window: RuleVisitWindow,
  anchorType: BulkScheduleRow['anchorType'],
): BulkScheduleRow {
  const visitCode = `${visitCodePrefix}${sequenceNo}`;
  return {
    localScheduleUuid: `generated-${beneficiaryId}-${visitCode}`,
    visitCode,
    visitType,
    sequenceNo,
    scheduledDate: window.scheduledDate,
    windowStartDate: window.windowOpen,
    windowEndDate: window.windowClose,
    anchorType,
    anchorVisitLocalUuid: null,
  };
}

/**
 * Converts one rule pack's evaluate-schedule output into the BulkScheduleRow[]
 * shape visitSchedule.service.ts's shared persistence path already expects —
 * so a generated schedule and a device-uploaded one are stored identically.
 * Each scheduleKind's output shape is distinct (ANC: flat visits[]; PP: a
 * fixed 5; NN: named nn1/nn2 slots; INC: visits[] + droppedVisits; HR: a
 * single optional hrVisit; DELIVERY: a dispatch decision, not visit windows
 * itself) — see scheduleEvaluator.ts's per-kind validators for the source of
 * truth this mirrors.
 */
export function toBulkScheduleRows(
  beneficiaryId: string,
  scheduleKind: GeneratableScheduleKind,
  evaluation: Record<string, unknown>,
  // Used only by the HR branch — the count of this beneficiary's HR
  // schedules of this visitType already on record, so the new row's
  // sequenceNo (and thus its visitCode/localScheduleUuid) is unique per
  // detection instead of always "1" (security review finding,
  // 2026-09-02 — see visitSchedule.repository.ts's
  // countByBeneficiaryAndVisitType doc comment for the bug this fixes).
  // Every other scheduleKind ignores this parameter.
  hrExistingCount = 0,
): BulkScheduleRow[] {
  switch (scheduleKind) {
    case 'ANC': {
      const visits = evaluation.visits;
      if (!Array.isArray(visits)) {
        throw badRequest('ANC evaluation did not return a visits array.');
      }
      const rows = visits.map((v, i) => {
        if (!isRuleVisitWindow(v)) throw badRequest(`ANC evaluation visits[${i}] is malformed.`);
        return toRow(beneficiaryId, 'ANC', 'ANC', i + 1, v, 'REGISTRATION');
      });
      const postEddVisit = evaluation.postEddVisit;
      if (postEddVisit !== null && postEddVisit !== undefined) {
        if (!isRuleVisitWindow(postEddVisit)) {
          throw badRequest('ANC evaluation postEddVisit is malformed.');
        }
        rows.push(toRow(beneficiaryId, 'ANC_POST_EDD', 'ANC_POST_EDD', 1, postEddVisit, 'EDD'));
      }
      return rows;
    }

    case 'PP': {
      const visits = evaluation.visits;
      if (!Array.isArray(visits) || visits.length !== 5) {
        throw badRequest('PP evaluation must return exactly 5 visits.');
      }
      return visits.map((v, i) => {
        if (!isRuleVisitWindow(v)) throw badRequest(`PP evaluation visits[${i}] is malformed.`);
        return toRow(beneficiaryId, 'PP', 'PP', i + 1, v, 'DELIVERY_DATE');
      });
    }

    case 'NN': {
      const rows: BulkScheduleRow[] = [];
      const nn1 = evaluation.nn1;
      const nn2 = evaluation.nn2;
      if (nn1 !== null && nn1 !== undefined) {
        if (!isRuleVisitWindow(nn1)) throw badRequest('NN evaluation nn1 is malformed.');
        rows.push(toRow(beneficiaryId, 'NN', 'NN', 1, nn1, 'DOB'));
      }
      if (nn2 !== null && nn2 !== undefined) {
        if (!isRuleVisitWindow(nn2)) throw badRequest('NN evaluation nn2 is malformed.');
        rows.push(toRow(beneficiaryId, 'NN', 'NN', 2, nn2, 'DOB'));
      }
      return rows;
    }

    case 'INC': {
      const visits = evaluation.visits;
      if (!Array.isArray(visits)) {
        throw badRequest('INC evaluation did not return a visits array.');
      }
      return visits.map((v, i) => {
        if (!isRuleVisitWindow(v)) throw badRequest(`INC evaluation visits[${i}] is malformed.`);
        return toRow(beneficiaryId, 'INC', 'INC', i + 1, v, 'DOB');
      });
    }

    case 'HR': {
      const generateHrVisit = evaluation.generateHrVisit;
      const hrVisit = evaluation.hrVisit;
      if (generateHrVisit !== true) return [];
      if (!isRuleVisitWindow(hrVisit)) {
        throw badRequest(
          'HR evaluation hrVisit is malformed or missing despite generateHrVisit=true.',
        );
      }
      // hrVisit.visitName is "<phase>-HR" (e.g. "INC-HR") per hr.rulesJson.ts —
      // derive the visitCode/visitType from it instead of hardcoding one phase,
      // since visitCodeTypeSchema defines distinct ANC_HR/PP_HR/NN_HR/INC_HR/
      // CCV_HR values. PP_HR/NN_HR are accepted here so this mapper is ready
      // the day hr.rulesJson.ts (rules-service) starts emitting them — it
      // doesn't yet, so those two branches are currently unreachable.
      const hrType = hrVisit.visitName.replace('-', '_');
      if (
        hrType !== 'ANC_HR' &&
        hrType !== 'PP_HR' &&
        hrType !== 'NN_HR' &&
        hrType !== 'INC_HR' &&
        hrType !== 'CCV_HR'
      ) {
        throw badRequest(
          `HR evaluation returned an unrecognised visitName: "${hrVisit.visitName}".`,
        );
      }
      return [toRow(beneficiaryId, hrType, hrType, hrExistingCount + 1, hrVisit, 'ACTUAL_VISIT')];
    }

    case 'DELIVERY':
      // DELIVERY's output is a dispatch decision (motherPlan/childPlans
      // saying whether to generate PP/NN/INC schedules), not visit windows
      // itself — there is nothing here to persist as a VisitSchedule row.
      // The caller is expected to issue separate /generate calls for PP/NN/
      // INC per the returned plan.
      return [];
  }
}
