import { badRequest, conflict, forbidden, notFound, unprocessable } from '@armman/service-commons';
import type { NewScheduleRow, VisitScheduleRepository } from './visitSchedule.repository';
import { toDateOnly } from './dto/create-visit-schedule-bulk.dto';
import type {
  BulkScheduleRow,
  CreateVisitScheduleBulkInput,
} from './dto/create-visit-schedule-bulk.dto';
import type { ListVisitSchedulesQuery } from './dto/list-visit-schedules.dto';
import { findBeneficiaryById } from '../beneficiaries/beneficiary.client';
import { evaluateAncScheduleFull, findRuleVersion } from '../rules/ruleVersion.client';
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
    await this.assertBeneficiaryAccess(dto.beneficiaryId, caller, authorizationHeader);

    const ruleVersion = await findRuleVersion(dto.generatedByRuleVersionId, authorizationHeader);
    if (!ruleVersion || ruleVersion.status !== 'PUBLISHED') {
      throw badRequest('generatedByRuleVersionId: unknown or not a published rule version.');
    }

    for (const row of dto.schedules) {
      const expectedSequenceNo = trailingSequenceNo(row.visitCode);
      if (expectedSequenceNo !== null && expectedSequenceNo !== row.sequenceNo) {
        throw badRequest(
          `visitCode "${row.visitCode}" disagrees with sequenceNo ${row.sequenceNo}.`,
        );
      }
    }

    const localScheduleUuids = dto.schedules.map((row) => row.localScheduleUuid);
    const existingByLocalUuid = new Map(
      (await this.repository.findByLocalScheduleUuids(dto.beneficiaryId, localScheduleUuids)).map(
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
    const visitCodes = [...new Set(dto.schedules.map((row) => row.visitCode))];
    const existingByVisitCode = await this.repository.findByBeneficiaryAndVisitCodes(
      dto.beneficiaryId,
      visitCodes,
    );
    for (const row of dto.schedules) {
      const conflictingRow = existingByVisitCode.find(
        (existing) =>
          existing.visitCode === row.visitCode &&
          existing.generatedByRuleVersionId === dto.generatedByRuleVersionId &&
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
    for (const row of dto.schedules) {
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
          dto.beneficiaryId,
          dto.generatedByRuleVersionId,
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
      beneficiaryId: dto.beneficiaryId,
      created: createdResults.length,
      alreadyExisted: alreadyExisted.length,
      schedules: [...createdResults, ...alreadyExisted],
    };
  }

  /**
   * List/sync-pull for one beneficiary's schedule — always beneficiary-
   * scoped (see list-visit-schedules.dto.ts's doc comment for why there's
   * no unscoped mode, even for MANAGER/ADMIN).
   */
  async list(query: ListVisitSchedulesQuery, caller: CallerIdentity, authorizationHeader: string) {
    await this.assertBeneficiaryAccess(query.beneficiaryId, caller, authorizationHeader);
    return this.repository.findMany(query);
  }

  /**
   * Bulk-lapses every OPEN/GENERATED schedule for a beneficiary — FR-S-3.7
   * (delivery form submission lapses all open ANC visits) and FR-S-10.1/10.2
   * (mother/child closure lapses all remaining open visits). Idempotent: a
   * beneficiary with nothing open simply lapses zero rows.
   *
   * `reason` isn't persisted anywhere yet — LAPSED is a bare status flip with
   * no history/audit table (see the SRS's own framing of it as a DB-only
   * status), so this parameter exists purely to make call sites
   * self-documenting once this is wired to a real form-submission trigger.
   * No public HTTP route calls this yet — DELIVERY/CLOSURE form codes don't
   * exist in this repo yet to gate the trigger on.
   */
  async lapseOpenSchedules(
    beneficiaryId: string,
    reason: 'DELIVERY_FORM_SUBMITTED' | 'CLOSURE_FORM_SUBMITTED',
    caller: CallerIdentity,
    authorizationHeader: string,
  ): Promise<{ lapsedCount: number }> {
    await this.assertBeneficiaryAccess(beneficiaryId, caller, authorizationHeader);
    void reason; // not yet persisted — see doc comment above.
    const result = await this.repository.lapseOpen(beneficiaryId, caller.id);
    return { lapsedCount: result.count };
  }

  /**
   * Regenerates a beneficiary's ANC schedule after a Supervisor-approved
   * LMP/EDD change (FR-SV-4.2) — the only sanctioned schedule-regeneration
   * trigger per the SRS. `registrationDate` stays the ORIGINAL registration
   * date (ANC1 anchors to registration, not LMP — FR-S-3.2); only `edd`
   * reflects the correction, since the ANC visit-count formula depends on it.
   *
   * Supersedes every currently OPEN/GENERATED ANC-family row before
   * inserting the new ones — never leaves both the old and new schedule
   * simultaneously OPEN. No SAKHI caller: this is a system-triggered action
   * off an approval decision, not something a Sakhi initiates directly.
   */
  async regenerateAncSchedule(
    beneficiaryId: string,
    registrationDate: string,
    edd: string,
    caller: CallerIdentity,
    authorizationHeader: string,
  ): Promise<{ supersededCount: number; created: number; schedules: CreatedScheduleResult[] }> {
    await this.assertBeneficiaryAccess(beneficiaryId, caller, authorizationHeader);

    const superseded = await this.repository.supersedeAnc(beneficiaryId, caller.id);

    const { ruleVersionId, scheduleRows } = await evaluateAncScheduleFull(
      registrationDate,
      edd,
      authorizationHeader,
    );

    const resolvedRows = this.resolveAnchors(scheduleRows as BulkScheduleRow[], new Map());
    const created = await this.repository.createAllOrNothing(
      resolvedRows,
      beneficiaryId,
      ruleVersionId,
      caller.id,
    );

    return {
      supersededCount: superseded.count,
      created: created.length,
      schedules: created.map((row) => ({
        localScheduleUuid: row.localScheduleUuid,
        scheduleId: row.id,
        status: row.status,
      })),
    };
  }

  /**
   * Shared ownership check for every beneficiary-scoped operation in this
   * service: SAKHI must own the beneficiary directly, SUPERVISOR must own
   * the beneficiary's Sakhi, MANAGER/ADMIN are unrestricted. Returns the
   * resolved beneficiary so callers that need more than the access check
   * (e.g. createBulk doesn't, but a future caller might) aren't forced to
   * re-fetch it.
   */
  private async assertBeneficiaryAccess(
    beneficiaryId: string,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
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

    return beneficiary;
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
