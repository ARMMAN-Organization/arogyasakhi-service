import { badRequest, conflict, forbidden, notFound, unprocessable } from '@armman/service-commons';
import type { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';
import type { UpdateVisitInstanceInput } from './dto/update-visitInstance.dto';
import type { VisitSummaryQueryInput } from './dto/visit-summary-query.dto';
import { findSakhiById, listSakhiIdsForSupervisor } from '../sakhis/sakhi.client';
import { resolveVisitStatusCode, resolveVisitStatusCodes } from '../lookups/lookup.client';

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

    return { total, byStatus };
  }
}
