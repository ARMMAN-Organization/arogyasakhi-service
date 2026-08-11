/**
 * One generated visit-schedule row, as returned by rules-service's
 * evaluate-schedule* endpoints. Field set mirrors rules-service's own
 * ScheduleRow (ruleSet.evaluator.ts) and this service's own
 * bulkScheduleRowSchema (create-visit-schedule-bulk.dto.ts) — duplicated
 * rather than imported across services, per the forklift rule.
 */
export interface ScheduleRow {
  localScheduleUuid: string;
  visitCode: string;
  visitType: string;
  sequenceNo: number;
  scheduledDate: string;
  windowStartDate: string;
  windowEndDate: string;
  anchorType: string;
  anchorVisitLocalUuid: string | null;
}
