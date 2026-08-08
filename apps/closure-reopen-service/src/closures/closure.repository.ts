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

  create(data: CreateClosureInput) {
    return this.prisma.closure.create({ data });
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
