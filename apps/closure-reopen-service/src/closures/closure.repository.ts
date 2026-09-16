import type { PrismaService } from '../prisma/prisma.service';
import type { CreateClosureInput } from './dto/create-closure.dto';
import type { DecideClosureInput } from './dto/decide-closure.dto';

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

export interface ListClosuresFilters {
  beneficiaryIds: string[];
  cursor?: string;
  limit: number;
}

/** Data access for closures. Owns only this service's `closures` table. */
export class ClosureRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.closure.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  /**
   * Cursor-paginated closure list, scoped to a resolved set of
   * beneficiaryIds — backs FR-SV-4.6's Data Restore flow (GET
   * /closures/by-sakhi). Closure carries no sakhiId column of its own, so
   * the caller (closure.service.ts) resolves the in-scope beneficiaryIds
   * via beneficiary-service's GET /beneficiaries/ids first. Sorts by
   * (createdAt desc, id desc) and fetches limit+1 rows, same convention as
   * the Data Restore CR's other list endpoints. Separate from findMany()
   * above (an unrelated, unscoped Quick Response widget listing) so that
   * endpoint's existing contract is untouched. An empty `beneficiaryIds`
   * returns an empty page without querying the DB.
   */
  async findManyPaginated(filters: ListClosuresFilters): Promise<{
    items: Awaited<ReturnType<PrismaService['closure']['findMany']>>;
    nextCursor: string | null;
  }> {
    if (filters.beneficiaryIds.length === 0) return { items: [], nextCursor: null };

    const where: NonNullable<Parameters<typeof this.prisma.closure.findMany>[0]>['where'] = {
      isDeleted: false,
      beneficiaryId: { in: filters.beneficiaryIds },
    };

    const decodedCursor = filters.cursor ? decodeCursor(filters.cursor) : null;

    const rows = await this.prisma.closure.findMany({
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
    return this.prisma.closure.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * Real-time supervisorStatus for a batch of closure ids — lets Quick
   * Response's list() reconcile against the current decision state instead
   * of trusting approval_requests' own (possibly stale) copy, since a
   * closure can also be decided directly via PATCH/POST
   * /closures/:id/decision, bypassing approval-service entirely. An id not
   * found (or soft-deleted) is simply absent from the result.
   */
  findManyByIds(ids: string[]) {
    return this.prisma.closure.findMany({
      where: { id: { in: ids }, isDeleted: false },
      select: { id: true, supervisorStatus: true },
    });
  }

  /**
   * Finds a closure previously created from this exact client-generated
   * localClosureUuid — lets create() treat a dropped-connection retry as an
   * idempotent replay instead of a new closure.
   */
  findByLocalClosureUuid(localClosureUuid: string) {
    return this.prisma.closure.findFirst({ where: { localClosureUuid, isDeleted: false } });
  }

  /**
   * supervisorStatus is a server-derived value (see ClosureService.create),
   * never client-suppliable — passed explicitly here rather than as part of
   * CreateClosureInput, which no longer carries it.
   */
  create(data: CreateClosureInput, supervisorStatus: 'PENDING' | null) {
    return this.prisma.closure.create({ data: { ...data, supervisorStatus } });
  }

  /**
   * Only updates a row that is still PENDING — `updateMany`'s affected count
   * (rather than a separate read-then-write) is the concurrency guard: if
   * another decision already landed between the caller's findById and this
   * call, the count comes back 0 and the service turns that into a 409
   * instead of silently overwriting an already-decided closure. Same pattern
   * as reopen-request.repository.ts's decide().
   */
  async decide(
    id: string,
    decidedBySupervisorId: string,
    dto: DecideClosureInput,
  ): Promise<boolean> {
    const result = await this.prisma.closure.updateMany({
      where: { id, isDeleted: false, supervisorStatus: 'PENDING' },
      data: {
        supervisorStatus: dto.decision,
        supervisorId: decidedBySupervisorId,
        ...(dto.supervisorNotes !== undefined && { supervisorNotes: dto.supervisorNotes }),
      },
    });
    return result.count > 0;
  }
}
