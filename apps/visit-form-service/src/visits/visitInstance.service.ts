import { badRequest, conflict, forbidden, notFound, unprocessable } from '@armman/service-commons';
import type { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';
import type { UpdateVisitInstanceInput } from './dto/update-visitInstance.dto';
import type { VisitSummaryQueryInput } from './dto/visit-summary-query.dto';
import { findSakhiById, listSakhiIdsForSupervisor } from '../sakhis/sakhi.client';
import { resolveVisitStatusCode, resolveVisitStatusCodes } from '../lookups/lookup.client';
import { getActiveTransferWindow } from '../escalations/escalation.client';

/** The calling principal's own identity, as carried on their trusted-identity headers. */
export interface CallerIdentity {
  readonly id: string;
  readonly roles: readonly string[];
  readonly projectId?: string | null;
}

/** MANAGER and ADMIN are unrestricted — same convention as every other service. */
function isPrivileged(caller: CallerIdentity): boolean {
  return caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN');
}

/**
 * Resolves the caller's own sakhiId/sakhiIds scope with no query-level
 * narrowing — SAKHI: own id; SUPERVISOR: full roster; MANAGER/ADMIN:
 * unscoped. Used by getCountByBeneficiary/getByPada to intersect a
 * caller-supplied beneficiaryIds list with the caller's own scope (never
 * trust that list as pre-scoped — see those methods' own doc comments for
 * the IDOR this closes).
 */
async function resolveCallerScoping(
  caller: CallerIdentity,
  authorizationHeader: string,
): Promise<{ sakhiId?: string; sakhiIds?: string[] }> {
  if (isPrivileged(caller)) {
    return {};
  }
  if (caller.roles.includes('SAKHI')) {
    return { sakhiId: caller.id };
  }
  // SUPERVISOR
  if (!caller.projectId) {
    throw forbidden('Supervisor caller has no project scope.');
  }
  const roster = await listSakhiIdsForSupervisor(caller.projectId, caller.id, authorizationHeader);
  return { sakhiIds: roster };
}

/** Visit instance domain logic. Data access is delegated to the repository. */
export class VisitInstanceService {
  constructor(private readonly repository: VisitInstanceRepository) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * A beneficiary's full visit history, for the reference app's Beneficiary
   * Data Download screen (offline reference — a Sakhi pre-fetches this
   * before a household visit with no connectivity). Unscoped by caller,
   * same as list() above: role gate only (SAKHI/SUPERVISOR/MANAGER), no
   * per-Sakhi/roster ownership check — this mirrors GET /visits' existing
   * behavior rather than introducing new IDOR scoping this endpoint wasn't
   * asked to add.
   */
  listByBeneficiaryId(beneficiaryId: string) {
    return this.repository.findManyByBeneficiaryId(beneficiaryId);
  }

  /**
   * A single visit's detail — added for Quick Response's card-enrichment
   * endpoint (approval-service resolves REFERRAL_INCOMPLETE cards' "visit
   * reference" through this), not a general SAKHI-facing read; the app has
   * no existing single-visit-read flow of its own (only list/summary/PATCH).
   */
  async getById(id: string) {
    const visit = await this.repository.findById(id);
    if (!visit) throw notFound('Visit instance not found.');
    return visit;
  }

  /**
   * Idempotent by localVisitUuid (@unique) — mirrors form.service.ts's
   * createSubmission and beneficiary.service.ts's enroll pattern. Without
   * this, a retried offline visit upload hit P2002 on the unique constraint
   * and surfaced as an unhandled 500 rather than returning the original row;
   * on rural connections a retry is the norm, not the exception.
   */
  async create(dto: CreateVisitInstanceInput) {
    const existing = await this.repository.findByLocalVisitUuid(dto.localVisitUuid);
    if (existing) return existing;

    const schedule = await this.repository.findScheduleById(dto.scheduleId);
    if (!schedule) {
      // 422, not 409 — this is "the referenced scheduleId doesn't exist"
      // (a bad reference), the same class of error supervisor-operations-
      // service's createCallLog uses unprocessable() for on an unknown
      // sakhiId — not a state conflict, which conflict()/409 is reserved for
      // elsewhere in this codebase (form.service.ts's concurrent-DRAFT/
      // wrong-status cases).
      throw unprocessable('scheduleId does not reference an existing visit schedule.');
    }

    return this.repository.create(dto);
  }

  /**
   * Transitions a visit's status (per SRS — lets a visit actually reach
   * COMPLETED/MISSED after POST /visits created it). `completedAt` is set
   * only when the new status resolves to COMPLETED — it represents when the
   * visit was actually conducted, so a MISSED visit (never conducted) leaves
   * it null; VisitStatusHistory is the record of when the MISSED transition
   * itself happened. Re-completing an already-COMPLETED visit is rejected
   * with 409, mirroring beneficiary.service.ts's reactivateCase pattern —
   * a completed visit is a terminal state change, not silently idempotent.
   *
   * IDOR scoping mirrors visitSchedule.service.ts: SAKHI may only touch her
   * own visit (visit.sakhiId === caller.id); SUPERVISOR only a visit whose
   * Sakhi is assigned to her (resolved via sakhi.client.ts, since this
   * service doesn't own sakhi_profiles); MANAGER/ADMIN unrestricted.
   */
  async updateStatus(
    id: string,
    dto: UpdateVisitInstanceInput,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Visit instance not found.');

    if (!isPrivileged(caller)) {
      if (caller.roles.includes('SAKHI')) {
        if (existing.sakhiId !== caller.id) {
          throw forbidden('You do not have access to this visit.');
        }
      } else {
        const sakhi = await findSakhiById(existing.sakhiId, authorizationHeader);
        if (!sakhi || sakhi.supervisorId !== caller.id) {
          throw forbidden('You do not have access to this visit.');
        }
      }
    }

    const [fromStatusCode, toStatusCode] = await Promise.all([
      existing.statusLookupValueId
        ? resolveVisitStatusCode(existing.statusLookupValueId, authorizationHeader)
        : Promise.resolve(null),
      resolveVisitStatusCode(dto.statusLookupValueId, authorizationHeader),
    ]);

    if (fromStatusCode === 'COMPLETED' && toStatusCode === 'COMPLETED') {
      throw conflict('This visit is already COMPLETED.');
    }

    // Missed Visit Escalation TRANSFER (FR-SV-4.3): "Supervisor must provide
    // reasons for each missed visit" during the Manager's review window —
    // only a SAKHI caller is gated (Supervisor/Manager/Admin are always
    // allowed, same as everywhere else in this codebase), so the extra
    // cross-service check only runs on the one path it can actually block.
    if (
      dto.notMetReason !== undefined &&
      toStatusCode === 'MISSED' &&
      !isPrivileged(caller) &&
      caller.roles.includes('SAKHI')
    ) {
      let activeWindow = { active: false };
      try {
        activeWindow = await getActiveTransferWindow(existing.beneficiaryId, authorizationHeader);
      } catch (err) {
        console.error(
          `Unable to check the Missed Visit Escalation transfer window for visit ${id} — ` +
            'allowing the write:',
          err,
        );
      }
      if (activeWindow.active) {
        throw forbidden(
          'Only a Supervisor may record a missed-visit reason while this beneficiary is under Manager review.',
        );
      }
    }

    const updated = await this.repository.updateStatus(
      id,
      existing.statusLookupValueId,
      { ...dto, completedAt: toStatusCode === 'COMPLETED' ? new Date() : null },
      caller.id,
    );
    if (!updated) {
      // Raced with another status change between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read (mirrors reactivateCase).
      throw conflict('This visit was already updated by another request.');
    }

    return this.repository.findById(id);
  }

  /**
   * Visit Summary widget — counts of in-scope visits grouped by status
   * valueCode, same role-scoping as updateStatus (SAKHI own visits,
   * SUPERVISOR roster via auth-service, MANAGER/ADMIN unscoped) and the
   * same fromDate/toDate cross-field check as beneficiary-service's summary
   * endpoints.
   */
  async getVisitSummary(
    query: VisitSummaryQueryInput,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
      throw badRequest('fromDate must be on or before toDate.');
    }

    let sakhiId: string | undefined;
    let sakhiIds: string[] | undefined;

    if (caller.roles.includes('SAKHI')) {
      sakhiId = caller.id;
    } else if (!isPrivileged(caller)) {
      // SUPERVISOR
      if (!caller.projectId) {
        throw forbidden('Supervisor caller has no project scope.');
      }
      if (query.sakhiId) {
        const roster = await listSakhiIdsForSupervisor(
          caller.projectId,
          caller.id,
          authorizationHeader,
        );
        if (!roster.includes(query.sakhiId)) {
          throw forbidden("sakhiId is not in this Supervisor's roster.");
        }
        sakhiId = query.sakhiId;
      } else {
        sakhiIds = await listSakhiIdsForSupervisor(
          caller.projectId,
          caller.id,
          authorizationHeader,
        );
      }
    } else if (query.sakhiId) {
      sakhiId = query.sakhiId;
    }

    const [grouped, statusCodes] = await Promise.all([
      this.repository.countByStatus({
        sakhiId,
        sakhiIds,
        fromDate: query.fromDate,
        toDate: query.toDate,
      }),
      resolveVisitStatusCodes(authorizationHeader),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of grouped) {
      const code = row.statusLookupValueId
        ? (statusCodes.get(row.statusLookupValueId) ?? 'UNKNOWN')
        : 'UNKNOWN';
      byStatus[code] = (byStatus[code] ?? 0) + row._count._all;
      total += row._count._all;
    }

    // "Ending soon" = a due (PENDING) or overdue (MISSED) visit whose
    // schedule window closes within the next 3 days — see dashboard SRS
    // discussion; there is no separate DUE/OVERDUE status (same mapping as
    // above/getCountByBeneficiary).
    const dueOrOverdueStatusLookupValueIds = [...statusCodes.entries()]
      .filter(([, code]) => code === 'PENDING' || code === 'MISSED')
      .map(([id]) => id);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');
    const endBoundary = new Date(today);
    endBoundary.setUTCDate(endBoundary.getUTCDate() + 3);
    const endingSoonVisitsCount = await this.repository.countEndingSoon({
      sakhiId,
      sakhiIds,
      fromDate: query.fromDate,
      toDate: query.toDate,
      dueOrOverdueStatusLookupValueIds,
      today,
      endBoundary,
    });

    return { total, byStatus, endingSoonVisitsCount };
  }

  /**
   * Due/overdue/due-today visit counts per beneficiaryId, for the
   * pada-breakdown widget — the caller (api-gateway) sums due/overdue per
   * pada+caseType for the Women/Child split, and dueTodayCount across all
   * beneficiaries in a pada for visitsRemainingCount. No role-scoping here:
   * the caller has already resolved the in-scope beneficiaryIds via
   * beneficiary-service's own scoping before calling this endpoint (see
   * routes doc comment). "Due" maps to VISIT_STATUS PENDING, "overdue" to
   * MISSED — there is no separate DUE/OVERDUE status (see
   * dashboard.controller.ts's identical mapping in api-gateway).
   * dueTodayCount is a raw visit count for that beneficiary today, not
   * deduped to 0-or-1 — the gateway sums it as-is per visitsRemainingCount's
   * "visits still due today" definition (a count of visits, not people).
   */
  async getCountByBeneficiary(
    beneficiaryIds: string[],
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    // Security: `beneficiaryIds` is caller-supplied and must never be
    // trusted as pre-scoped — without this, any authenticated caller could
    // pass an arbitrary beneficiaryIds list and get back another Sakhi's/
    // roster's visit counts (IDOR). The repository intersects the
    // requested ids with this scope via sakhiId, so an out-of-scope id is
    // silently excluded from the result rather than surfaced as a 403.
    const scoping = await resolveCallerScoping(caller, authorizationHeader);
    const statusCodes = await resolveVisitStatusCodes(authorizationHeader);
    const dueOrOverdueStatusLookupValueIds = [...statusCodes.entries()]
      .filter(([, code]) => code === 'PENDING' || code === 'MISSED')
      .map(([id]) => id);
    const today = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00.000Z');

    const [grouped, dueTodayByBeneficiary] = await Promise.all([
      this.repository.countByBeneficiary(beneficiaryIds, scoping),
      this.repository.countDueTodayByBeneficiary(
        beneficiaryIds,
        dueOrOverdueStatusLookupValueIds,
        today,
        scoping,
      ),
    ]);

    const byBeneficiary: Record<
      string,
      { dueVisitsCount: number; overdueVisitsCount: number; dueTodayCount: number }
    > = {};
    for (const row of grouped) {
      const code = row.statusLookupValueId ? statusCodes.get(row.statusLookupValueId) : undefined;
      if (code !== 'PENDING' && code !== 'MISSED') continue;
      const entry = (byBeneficiary[row.beneficiaryId] ??= {
        dueVisitsCount: 0,
        overdueVisitsCount: 0,
        dueTodayCount: 0,
      });
      if (code === 'PENDING') entry.dueVisitsCount += row._count._all;
      if (code === 'MISSED') entry.overdueVisitsCount += row._count._all;
    }
    for (const [beneficiaryId, count] of dueTodayByBeneficiary) {
      const entry = (byBeneficiary[beneficiaryId] ??= {
        dueVisitsCount: 0,
        overdueVisitsCount: 0,
        dueTodayCount: 0,
      });
      entry.dueTodayCount = count;
    }
    return byBeneficiary;
  }

  /**
   * Full visit cards (visitId, beneficiaryId, visitType, dueDate) for the
   * pada visit-list screen's "open" tab — due (PENDING) or overdue (MISSED)
   * visits scheduled on `date` for the given beneficiaries. No
   * role-scoping: the caller (api-gateway) has already resolved the
   * in-scope beneficiaryIds via beneficiary-service's own scoping.
   * visitType is the device-generated visitCode formatted for display
   * (e.g. "ANC3" -> "ANC 3") — a code with no trailing digits (e.g.
   * "DELIVERY") is left unchanged.
   */
  async getByPada(
    beneficiaryIds: string[],
    date: string,
    caller: CallerIdentity,
    authorizationHeader: string,
  ) {
    // Security: same IDOR guard as getCountByBeneficiary — beneficiaryIds
    // is caller-supplied and is intersected with the caller's own scope
    // before querying, never trusted as pre-scoped.
    const scoping = await resolveCallerScoping(caller, authorizationHeader);
    const statusCodes = await resolveVisitStatusCodes(authorizationHeader);
    const pendingStatusLookupValueIds = [...statusCodes.entries()]
      .filter(([, code]) => code === 'PENDING')
      .map(([id]) => id);
    const missedStatusLookupValueIds = [...statusCodes.entries()]
      .filter(([, code]) => code === 'MISSED')
      .map(([id]) => id);
    const dateOnly = new Date(`${date}T00:00:00.000Z`);

    const rows = await this.repository.findByPada(
      beneficiaryIds,
      pendingStatusLookupValueIds,
      missedStatusLookupValueIds,
      dateOnly,
      scoping,
    );

    return rows.map((row) => ({
      visitId: row.id,
      beneficiaryId: row.beneficiaryId,
      visitType: formatVisitCode(row.schedule.visitCode),
      dueDate: row.schedule.scheduledDate.toISOString().slice(0, 10),
    }));
  }
}

/** Inserts a space before the trailing digits of a device-generated visit
 * code — "ANC3" -> "ANC 3", "INC11" -> "INC 11". A code with no trailing
 * digits (e.g. "DELIVERY") is returned unchanged. */
function formatVisitCode(visitCode: string): string {
  return visitCode.replace(/(\D)(\d+)$/, '$1 $2');
}
