import type { PrismaService } from '../prisma/prisma.service';
import type { CreateClosureInput } from './dto/create-closure.dto';
import type { DecideClosureInput } from './dto/decide-closure.dto';

/** Data access for closures. Owns only this service's `closures` table. */
export class ClosureRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.closure.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
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
   * Full detail for a batch of closure ids — same row shape as findById(),
   * batched via a single `IN (...)` query instead of N single-item lookups.
   * Added for approval-service's Quick Response card-enrichment endpoint,
   * whose concurrent per-card GET /closures/:id calls were overloading the
   * gateway. An id not found (or soft-deleted) is simply absent from the
   * result, not an error; a duplicate id in the input naturally collapses to
   * one row since `id` is the primary key.
   */
  findManyDetailByIds(ids: string[]) {
    return this.prisma.closure.findMany({ where: { id: { in: ids }, isDeleted: false } });
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
