import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReopenRequestInput } from './dto/create-reopen-request.dto';
import type { DecideReopenRequestInput } from './dto/decide-reopen-request.dto';

/** Data access for reopen_requests. Owns only this service's `reopen_requests` table. */
export class ReopenRequestRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.reopenRequest.findFirst({ where: { id, isDeleted: false } });
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
