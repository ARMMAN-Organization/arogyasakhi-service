import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReopenRequestInput } from './dto/create-reopen-request.dto';
import type { DecideReopenRequestInput } from './dto/decide-reopen-request.dto';

/** Data access for reopen_requests. Owns only this service's `reopen_requests` table. */
export class ReopenRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.reopenRequest.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * Real-time supervisorStatus for a batch of reopen request ids — lets
   * Quick Response's list() reconcile against the current decision state
   * instead of trusting approval_requests' own (possibly stale) copy, since
   * a reopen request can also be decided directly via PATCH/POST
   * /reopen-requests/:id/decision, bypassing approval-service entirely. An
   * id not found (or soft-deleted) is simply absent from the result.
   */
  findManyByIds(ids: string[]) {
    return this.prisma.reopenRequest.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: { id: true, supervisorStatus: true },
    });
  }

  /**
   * Full detail for a batch of reopen request ids — same row shape as
   * findById(), batched via a single `IN (...)` query instead of N
   * single-item lookups. Added for approval-service's Quick Response card-
   * enrichment endpoint, whose concurrent per-card GET /reopen-requests/:id
   * calls were overloading the gateway. An id not found (or soft-deleted) is
   * simply absent from the result, not an error; a duplicate id in the input
   * naturally collapses to one row since `id` is the primary key.
   */
  findManyDetailByIds(ids: string[]) {
    return this.prisma.reopenRequest.findMany({ where: { id: { in: ids }, isDeleted: false } });
  }

  /**
   * Finds a reopen request previously created from this exact
   * client-generated localReopenRequestUuid — lets create() treat a
   * dropped-connection retry as an idempotent replay instead of a new
   * reopen request.
   */
  findByLocalReopenRequestUuid(localReopenRequestUuid: string) {
    return this.prisma.reopenRequest.findFirst({
      where: { localReopenRequestUuid, isDeleted: false },
    });
  }

  /**
   * All reopen requests raised for one beneficiary, most-recent first — lets
   * the app show "Reopen pending review" (any entry with
   * supervisorStatus: 'PENDING') instead of just "Closed" while a request is
   * mid-flow. A beneficiary with no reopen requests returns an empty array,
   * not an error — most beneficiaries never had one.
   */
  findByBeneficiaryId(beneficiaryId: string) {
    return this.prisma.reopenRequest.findMany({
      where: { beneficiaryId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });
  }

  create(data: CreateReopenRequestInput & { requestedByUserId: string }) {
    return this.prisma.reopenRequest.create({
      data: { ...data, requestedAt: new Date() },
    });
  }

  /**
   * Only updates a row that is still `PENDING` — `updateMany`'s affected
   * count (rather than a separate read-then-write) is the concurrency guard:
   * if another decision already landed between the caller's `findById` and
   * this call, the count comes back 0 and the service turns that into a 409
   * instead of silently overwriting an already-decided request.
   */
  async decide(
    id: string,
    decidedByUserId: string,
    dto: DecideReopenRequestInput,
  ): Promise<boolean> {
    const result = await this.prisma.reopenRequest.updateMany({
      where: { id, isDeleted: false, supervisorStatus: 'PENDING' },
      data: {
        supervisorStatus: dto.decision,
        decisionReasonCodeLookupId: dto.decisionReasonCodeLookupId ?? null,
        decisionNotes: dto.decisionNotes ?? null,
        decidedByUserId,
        decidedAt: new Date(),
      },
    });
    return result.count > 0;
  }
}
