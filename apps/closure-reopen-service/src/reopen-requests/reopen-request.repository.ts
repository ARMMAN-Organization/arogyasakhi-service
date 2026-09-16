import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReopenRequestInput } from './dto/create-reopen-request.dto';
import type { DecideReopenRequestInput } from './dto/decide-reopen-request.dto';

/**
 * Encodes a row's (createdAt, id) pair as an opaque pagination cursor — same
 * codec as visit-form-service's visitInstance.repository.ts, kept per-
 * service per the forklift rule rather than a shared lib import.
 */
function encodeCursor(row: { createdAt: Date; id: string }): string {
  const cursor = { createdAt: row.createdAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Decodes a cursor produced by encodeCursor; returns null on any malformed input (treated as "start from the beginning"). */
function decodeCursor(cursor: string): { createdAt: string; id: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.createdAt === 'string' && typeof parsed?.id === 'string') {
      return parsed as { createdAt: string; id: string };
    }
    return null;
  } catch {
    return null;
  }
}

export interface ListReopenRequestsFilters {
  beneficiaryIds: string[];
  cursor?: string;
  limit: number;
}

/** Data access for reopen_requests. Owns only this service's `reopen_requests` table. */
export class ReopenRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Cursor-paginated reopen-request list, scoped to a resolved set of
   * beneficiaryIds — backs FR-SV-4.6's Data Restore flow (GET
   * /reopen-requests/by-sakhi). ReopenRequest carries no sakhiId column of
   * its own, so the caller (reopen-request.service.ts) resolves the
   * in-scope beneficiaryIds via beneficiary-service's GET /beneficiaries/ids
   * first. Sorts by (createdAt desc, id desc) and fetches limit+1 rows,
   * same convention as the Data Restore CR's other list endpoints. Separate
   * from findByBeneficiaryId below (the existing per-beneficiary
   * unpaginated listing) — this is the bulk-by-sakhi variant. An empty
   * `beneficiaryIds` returns an empty page without querying the DB.
   */
  async findManyPaginated(filters: ListReopenRequestsFilters): Promise<{
    items: Awaited<ReturnType<PrismaService['reopenRequest']['findMany']>>;
    nextCursor: string | null;
  }> {
    if (filters.beneficiaryIds.length === 0) return { items: [], nextCursor: null };

    const where: NonNullable<Parameters<typeof this.prisma.reopenRequest.findMany>[0]>['where'] = {
      isDeleted: false,
      beneficiaryId: { in: filters.beneficiaryIds },
    };

    const decodedCursor = filters.cursor ? decodeCursor(filters.cursor) : null;

    const rows = await this.prisma.reopenRequest.findMany({
      where: decodedCursor
        ? {
            ...where,
            OR: [
              { createdAt: { lt: new Date(decodedCursor.createdAt) } },
              { createdAt: new Date(decodedCursor.createdAt), id: { lt: decodedCursor.id } },
            ],
          }
        : where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
    });

    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;
    const lastItem = items[items.length - 1];
    return { items, nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null };
  }

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
