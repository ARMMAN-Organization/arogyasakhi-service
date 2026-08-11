import type { PrismaService } from '../prisma/prisma.service';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';
import type { UpdateVisitInstanceInput } from './dto/update-visitInstance.dto';

interface ListCursor {
  updatedAt: string;
  id: string;
}

/** Encodes a row's sort key as an opaque pagination cursor. */
function encodeCursor(row: { updatedAt: Date; id: string }): string {
  const cursor: ListCursor = { updatedAt: row.updatedAt.toISOString(), id: row.id };
  return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}

/** Decodes a cursor produced by encodeCursor; returns null on any malformed input. */
function decodeCursor(cursor: string): ListCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed?.updatedAt === 'string' && typeof parsed?.id === 'string') {
      return parsed as ListCursor;
    }
    return null;
  } catch {
    return null;
  }
}

export interface ListVisitInstancesFilters {
  beneficiaryId?: string;
  sakhiId?: string;
  sakhiIds?: string[];
  statusLookupValueId?: string;
  updatedAfter?: string;
  cursor?: string;
  limit: number;
}

/** Data access for visit instances. Owns only this service's `visit_instances` table. */
export class VisitInstanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Keyset-paginated list/sync-pull, role-scoped by the caller-resolved
   * sakhiId/sakhiIds (see visitInstance.service.ts's list()) — same cursor
   * pattern as visitSchedule.repository.ts's findMany (sort key
   * (updatedAt desc, id desc), base64url cursor, limit+1 fetch).
   */
  async findMany(filters: ListVisitInstancesFilters) {
    const where: NonNullable<Parameters<typeof this.prisma.visitInstance.findMany>[0]>['where'] = {
      isDeleted: false,
    };
    if (filters.beneficiaryId) where.beneficiaryId = filters.beneficiaryId;
    if (filters.sakhiId) where.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) where.sakhiId = { in: filters.sakhiIds };
    if (filters.statusLookupValueId) where.statusLookupValueId = filters.statusLookupValueId;
    if (filters.updatedAfter) where.updatedAt = { gt: new Date(filters.updatedAfter) };

    const decodedCursor = filters.cursor ? decodeCursor(filters.cursor) : null;

    const rows = await this.prisma.visitInstance.findMany({
      where: decodedCursor
        ? {
            ...where,
            OR: [
              { updatedAt: { lt: new Date(decodedCursor.updatedAt) } },
              { updatedAt: new Date(decodedCursor.updatedAt), id: { lt: decodedCursor.id } },
            ],
          }
        : where,
      orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }],
      take: filters.limit + 1,
    });

    const hasMore = rows.length > filters.limit;
    const items = hasMore ? rows.slice(0, filters.limit) : rows;
    const lastItem = items[items.length - 1];
    return { items, nextCursor: hasMore && lastItem ? encodeCursor(lastItem) : null };
  }

  findByLocalVisitUuid(localVisitUuid: string) {
    return this.prisma.visitInstance.findUnique({ where: { localVisitUuid } });
  }

  findById(id: string) {
    return this.prisma.visitInstance.findFirst({ where: { id, isDeleted: false } });
  }

  /**
   * Counts in-scope visits by their raw statusLookupValueId, filtered by
   * VisitSchedule.scheduledDate — the date the visit was DUE, not
   * actualVisitDate (when/if it happened), per the visit-summary widget's
   * confirmed semantics: a MISSED visit has no actualVisitDate but must
   * still be countable within the period it was due in. The service layer
   * resolves each statusLookupValueId to its human-readable valueCode.
   */
  async countByStatus(filters: {
    sakhiId?: string;
    sakhiIds?: string[];
    fromDate?: string;
    toDate?: string;
  }) {
    const where: NonNullable<Parameters<typeof this.prisma.visitInstance.groupBy>[0]>['where'] = {
      isDeleted: false,
    };
    if (filters.sakhiId) where.sakhiId = filters.sakhiId;
    if (filters.sakhiIds) where.sakhiId = { in: filters.sakhiIds };
    if (filters.fromDate || filters.toDate) {
      where.schedule = {
        scheduledDate: {
          ...(filters.fromDate ? { gte: new Date(`${filters.fromDate}T00:00:00.000Z`) } : {}),
          ...(filters.toDate ? { lte: new Date(`${filters.toDate}T23:59:59.999Z`) } : {}),
        },
      };
    }

    return this.prisma.visitInstance.groupBy({
      by: ['statusLookupValueId'],
      where,
      _count: { _all: true },
    });
  }

  findScheduleById(scheduleId: string) {
    return this.prisma.visitSchedule.findFirst({
      where: { id: scheduleId, isDeleted: false },
    });
  }

  create(data: CreateVisitInstanceInput) {
    return this.prisma.visitInstance.create({ data });
  }

  /**
   * Applies a status transition, in one transaction with the
   * VisitStatusHistory row that records it. Only updates a row still at
   * `existing.statusLookupValueId` — the same optimistic-concurrency guard
   * `beneficiary.repository.ts`'s `reactivateCase` uses: if the visit's
   * status already changed between the caller's findById and this call,
   * `count` comes back 0 and the service turns that into a 409 instead of
   * silently overwriting a since-changed visit.
   */
  async updateStatus(
    id: string,
    fromStatusLookupValueId: string | null,
    data: UpdateVisitInstanceInput & { completedAt: Date | null },
    changedByUserId: string,
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.visitInstance.updateMany({
        where: { id, isDeleted: false, statusLookupValueId: fromStatusLookupValueId },
        data: {
          statusLookupValueId: data.statusLookupValueId,
          actualVisitDate: data.actualVisitDate,
          meetBeneficiaryFlag: data.meetBeneficiaryFlag,
          notMetReason: data.notMetReason,
          completedAt: data.completedAt,
        },
      });
      if (result.count === 0) return false;

      await tx.visitStatusHistory.create({
        data: {
          visitId: id,
          fromStatusLookupValueId,
          toStatusLookupValueId: data.statusLookupValueId,
          changedByUserId,
          changedAt: new Date(),
        },
      });
      return true;
    });
  }
}
