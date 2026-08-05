import { badRequest, conflict, forbidden, notFound, unprocessable } from '@armman/service-commons';
import type { NewScheduleRow, VisitScheduleRepository } from './visitSchedule.repository';
import { toDateOnly } from './dto/create-visit-schedule-bulk.dto';
import type {
  BulkScheduleRow,
  CreateVisitScheduleBulkInput,
} from './dto/create-visit-schedule-bulk.dto';
import { findBeneficiaryById } from '../beneficiaries/beneficiary.client';
import { findRuleVersion } from '../rules/ruleVersion.client';
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
    const beneficiary = await findBeneficiaryById(dto.beneficiaryId, authorizationHeader);
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
      (await this.repository.findByLocalScheduleUuids(localScheduleUuids)).map((row) => [
        row.localScheduleUuid,
        row,
      ]),
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

    const created =
      resolvedNewRows.length > 0
        ? await this.repository.createAllOrNothing(
            resolvedNewRows,
            dto.beneficiaryId,
            dto.generatedByRuleVersionId,
            caller.id,
          )
        : [];

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
