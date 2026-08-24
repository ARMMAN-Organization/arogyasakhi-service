import { badRequest, conflict, forbidden, notFound, unprocessable } from '@armman/service-commons';
import type { NewScheduleRow, VisitScheduleRepository } from './visitSchedule.repository';
import { toDateOnly } from './dto/create-visit-schedule-bulk.dto';
import type {
  BulkScheduleRow,
  CreateVisitScheduleBulkInput,
} from './dto/create-visit-schedule-bulk.dto';
import type { GenerateVisitScheduleInput } from './dto/generate-visit-schedule.dto';
import { toBulkScheduleRows } from './scheduleMapper';
import { ruleSetIdFor } from './scheduleRuleSets';
import { findBeneficiaryById } from '../beneficiaries/beneficiary.client';
import { findRuleVersion } from '../rules/ruleVersion.client';
import { evaluateSchedule } from '../rules/evaluateSchedule.client';
import { findSakhiById } from '../sakhis/sakhi.client';

/** The calling principal's own identity, as carried on their trusted-identity headers. */
export interface CallerIdentity {
  readonly id: string;
  readonly roles: readonly string[];
}

/** MANAGER and ADMIN are unrestricted — same convention as every other service. */
function isPrivileged(caller: CallerIdentity): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

/** The digits at the end of a visitCode (e.g. "3" in "ANC3", "11" in "INC11"). */
function trailingSequenceNo(visitCode: string): number | null {
  const match = /(\d+)$/.exec(visitCode);
  return match ? Number(match[1]) : null;
}

/** Narrows a caught Prisma error to a unique-constraint violation (P2002). */
function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === 'P2002'
  );
}

/**
 * True if `row` (the incoming payload) matches every field of `existing`
 * (the previously stored row) that a genuine retry would resend unchanged.
 * A same-localScheduleUuid row with different content is not a retry — it's
 * either a client bug or a stale/reused uuid — so idempotency must not
 * silently accept it.
 */
function matchesStoredRow(
  row: BulkScheduleRow,
  existing: {
    visitCode: string;
    visitType: string;
    sequenceNo: number | null;
    scheduledDate: Date;
    windowStartDate: Date;
    windowEndDate: Date;
    anchorType: string;
    anchorVisitId: string | null;
  },
): boolean {
  return (
    row.visitCode === existing.visitCode &&
    row.visitType === existing.visitType &&
    row.sequenceNo === existing.sequenceNo &&
    toDateOnly(row.scheduledDate).getTime() === existing.scheduledDate.getTime() &&
    toDateOnly(row.windowStartDate).getTime() === existing.windowStartDate.getTime() &&
    toDateOnly(row.windowEndDate).getTime() === existing.windowEndDate.getTime() &&
    row.anchorType === existing.anchorType &&
    // The stored row only has the resolved anchorVisitId, not the original
    // anchorVisitLocalUuid — can't compare the uuids themselves, but "has an
    // anchor" vs "has none" must still agree.
    (row.anchorVisitLocalUuid === null) === (existing.anchorVisitId === null)
  );
}

export interface CreatedScheduleResult {
  localScheduleUuid: string;
  scheduleId: string;
  status: string;
}

export interface CreateBulkResult {
  beneficiaryId: string;
  created: number;
  alreadyExisted: number;
  schedules: CreatedScheduleResult[];
}

/**
 * Visit schedule domain logic — bulk upload from the device (FR-S-2.2/2.2A).
 * The phone is the author of these rows; this service only receives,
 * validates and stores them.
 */
export class VisitScheduleService {
  constructor(private readonly repository: VisitScheduleRepository) {}

  async createBulk(
    dto: CreateVisitScheduleBulkInput,
    caller: CallerIdentity,
    authorizationHeader: string,
  ): Promise<CreateBulkResult> {
    await this.assertCanTouchBeneficiary(dto.beneficiaryId, caller, authorizationHeader);

    const ruleVersion = await findRuleVersion(dto.generatedByRuleVersionId, authorizationHeader);
    if (!ruleVersion || ruleVersion.status !== 'PUBLISHED') {
      throw badRequest('generatedByRuleVersionId: unknown or not a published rule version.');
    }

    return this.persistSchedules(
      dto.beneficiaryId,
      dto.generatedByRuleVersionId,
      dto.schedules,
      caller,
    );
  }

  /**
   * Computes a beneficiary's visit schedule for one SRS-mandated journey by
   * calling rules-service's published GoRules SCHEDULE pack (FR-S-2.2A/SRS
   * §3A.2.3), then persists the result through the exact same
   * validation/idempotency/conflict path createBulk uses — a generated and a
   * device-uploaded schedule are stored identically, and both are subject to
   * the same ownership check. DELIVERY returns no rows to persist itself (it
   * is a dispatch decision, not visit windows — see scheduleMapper.ts); the
   * evaluation is still returned to the caller so they know which of
   * PP/NN/INC to generate next.
   */
  async generateSchedule(
    dto: GenerateVisitScheduleInput,
    caller: CallerIdentity,
    authorizationHeader: string,
  ): Promise<CreateBulkResult & { evaluation: Record<string, unknown> }> {
    await this.assertCanTouchBeneficiary(dto.beneficiaryId, caller, authorizationHeader);

    const ruleSetId = ruleSetIdFor(dto.scheduleKind);
    if (!ruleSetId) {
      throw badRequest(`No rule set is configured for the "${dto.scheduleKind}" schedule kind.`);
    }

    // Each discriminated-union variant of GenerateVisitScheduleInput already
    // contains exactly the fields that journey's rulesJson pack destructures
    // — nothing more, nothing less (see the DTO's own comment for why a
    // shared "every possible field" shape was tried first and found wrong).
    // Stripping beneficiaryId/scheduleKind therefore always leaves the
    // correct per-kind input object, without a per-kind switch here.
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- destructured only to omit from `input`
    const { beneficiaryId, scheduleKind, ...input } = dto;

    const evaluation = await evaluateSchedule(
      ruleSetId,
      dto.scheduleKind,
      input,
      authorizationHeader,
    );

    const rows = toBulkScheduleRows(dto.beneficiaryId, dto.scheduleKind, evaluation);
    if (rows.length === 0) {
      return {
        beneficiaryId: dto.beneficiaryId,
        created: 0,
        alreadyExisted: 0,
        schedules: [],
        evaluation,
      };
    }

    const result = await this.persistSchedules(
      dto.beneficiaryId,
      evaluation.ruleVersionId,
      rows,
      caller,
    );
    return { ...result, evaluation };
  }

  private async assertCanTouchBeneficiary(
    beneficiaryId: string,
    caller: CallerIdentity,
    authorizationHeader: string,
  ): Promise<void> {
    const beneficiary = await findBeneficiaryById(beneficiaryId, authorizationHeader);
    if (!beneficiary) throw notFound('Beneficiary case not found.');

    if (!isPrivileged(caller)) {
      if (caller.roles.includes('SAKHI')) {
        if (beneficiary.sakhiId !== caller.id) {
          throw forbidden('You do not have access to this beneficiary.');
        }
      } else {
        // SUPERVISOR: authorized only if the beneficiary's own Sakhi is
        // assigned to this caller — mirrors listCallLogsBySakhi's ownership
        // check in supervisor-operations-service, since visit-form-service
        // doesn't own sakhi_profiles either (forklift rule).
        const sakhi = await findSakhiById(beneficiary.sakhiId, authorizationHeader);
        if (!sakhi || sakhi.supervisorId !== caller.id) {
          throw forbidden('You do not have access to this beneficiary.');
        }
      }
    }
  }

  /**
   * Shared validation + idempotent persistence for a set of schedule rows,
   * used by both createBulk (device-supplied dates) and generateSchedule
   * (GoRules-computed dates) — identical conflict/anchor/idempotency
   * behavior regardless of which produced the rows.
   */
  private async persistSchedules(
    beneficiaryId: string,
    generatedByRuleVersionId: string,
    schedules: BulkScheduleRow[],
    caller: CallerIdentity,
  ): Promise<CreateBulkResult> {
    for (const row of schedules) {
      const expectedSequenceNo = trailingSequenceNo(row.visitCode);
      if (expectedSequenceNo !== null && expectedSequenceNo !== row.sequenceNo) {
        throw badRequest(
          `visitCode "${row.visitCode}" disagrees with sequenceNo ${row.sequenceNo}.`,
        );
      }
    }

    const localScheduleUuids = schedules.map((row) => row.localScheduleUuid);
    const existingByLocalUuid = new Map(
      (await this.repository.findByLocalScheduleUuids(beneficiaryId, localScheduleUuids)).map(
        (row) => [row.localScheduleUuid, row],
      ),
    );

    // Conflict check: same (beneficiaryId, visitCode, generatedByRuleVersionId)
    // already stored under a DIFFERENT localScheduleUuid is a real conflict,
    // not an update — fixing a schedule goes through supersede (not built for
    // M2), never a re-upload under a new uuid. Checked against every existing
    // row for this beneficiary+visitCode, not just rows this batch's own
    // localScheduleUuids happened to match, so a genuinely new uuid replaying
    // an already-scheduled visitCode is still caught.
    const visitCodes = [...new Set(schedules.map((row) => row.visitCode))];
    const existingByVisitCode = await this.repository.findByBeneficiaryAndVisitCodes(
      beneficiaryId,
      visitCodes,
    );
    for (const row of schedules) {
      const conflictingRow = existingByVisitCode.find(
        (existing) =>
          existing.visitCode === row.visitCode &&
          existing.generatedByRuleVersionId === generatedByRuleVersionId &&
          existing.localScheduleUuid !== row.localScheduleUuid,
      );
      if (conflictingRow) {
        throw conflict(
          `A schedule for visitCode "${row.visitCode}" already exists under a different localScheduleUuid.`,
        );
      }
    }

    const newRows: BulkScheduleRow[] = [];
    const alreadyExisted: CreatedScheduleResult[] = [];
    for (const row of schedules) {
      const existing = existingByLocalUuid.get(row.localScheduleUuid);
      if (existing) {
        if (!matchesStoredRow(row, existing)) {
          throw conflict(
            `localScheduleUuid "${row.localScheduleUuid}" is already stored with different content — a retried upload must resend the same payload.`,
          );
        }
        alreadyExisted.push({
          localScheduleUuid: row.localScheduleUuid,
          scheduleId: existing.id,
          status: existing.status,
        });
      } else {
        newRows.push(row);
      }
    }

    const resolvedNewRows = this.resolveAnchors(newRows, existingByLocalUuid);

    let created: Awaited<ReturnType<VisitScheduleRepository['createAllOrNothing']>> = [];
    if (resolvedNewRows.length > 0) {
      try {
        created = await this.repository.createAllOrNothing(
          resolvedNewRows,
          beneficiaryId,
          generatedByRuleVersionId,
          caller.id,
        );
      } catch (err) {
        // localScheduleUuid is globally @unique, but the idempotency lookup
        // above is scoped to this beneficiaryId — a uuid already used by a
        // DIFFERENT beneficiary's schedule is invisible to that lookup, so
        // it reaches here as a "new" row and collides with the DB
        // constraint instead. Surface that as a 409, not an unhandled 500.
        if (isUniqueConstraintViolation(err)) {
          throw conflict('One or more localScheduleUuid values are already in use.');
        }
        throw err;
      }
    }

    const createdResults: CreatedScheduleResult[] = created.map((row) => ({
      localScheduleUuid: row.localScheduleUuid,
      scheduleId: row.id,
      status: row.status,
    }));

    return {
      beneficiaryId,
      created: createdResults.length,
      alreadyExisted: alreadyExisted.length,
      schedules: [...createdResults, ...alreadyExisted],
    };
  }

  /**
   * Resolves each new row's anchorVisitLocalUuid — first against
   * already-stored rows (anchorVisitId set directly), then against other NEW
   * rows in this same batch (batchAnchorLocalUuid set instead, since that
   * sibling's real id doesn't exist yet — the repository's second pass
   * resolves it once the sibling has been inserted). Throws (aborting the
   * whole batch, per the "reject rather than store null and carry on"
   * requirement) if an anchor is neither.
   */
  private resolveAnchors(
    rows: BulkScheduleRow[],
    existingByLocalUuid: Map<string, { id: string }>,
  ): NewScheduleRow[] {
    const inThisBatch = new Set(rows.map((row) => row.localScheduleUuid));

    return rows.map((row) => {
      const { anchorVisitLocalUuid, scheduledDate, windowStartDate, windowEndDate, ...rest } = row;
      // scheduledDate/windowStartDate/windowEndDate arrive here as validated
      // YYYY-MM-DD strings (see dateOnlySchema's own comment on why it isn't
      // a .transform()) — converted to Date only now, after validation.
      const dates = {
        scheduledDate: toDateOnly(scheduledDate),
        windowStartDate: toDateOnly(windowStartDate),
        windowEndDate: toDateOnly(windowEndDate),
      };

      if (anchorVisitLocalUuid === null) {
        return { ...rest, ...dates, anchorVisitId: null, batchAnchorLocalUuid: null };
      }

      const existing = existingByLocalUuid.get(anchorVisitLocalUuid);
      if (existing) {
        return { ...rest, ...dates, anchorVisitId: existing.id, batchAnchorLocalUuid: null };
      }

      if (inThisBatch.has(anchorVisitLocalUuid)) {
        return {
          ...rest,
          ...dates,
          anchorVisitId: null,
          batchAnchorLocalUuid: anchorVisitLocalUuid,
        };
      }

      throw unprocessable(
        `anchorVisitLocalUuid "${anchorVisitLocalUuid}" is not in this batch and not already stored.`,
      );
    });
  }
}
