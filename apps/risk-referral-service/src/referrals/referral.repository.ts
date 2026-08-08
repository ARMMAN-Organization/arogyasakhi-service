import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReferralInput } from './dto/create-referral.dto';

/** Data access for referrals. Owns only this service's `referrals` table. */
export class ReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.referral.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  findById(id: string) {
    return this.prisma.referral.findFirst({ where: { id, isDeleted: false } });
  }

  create(data: CreateReferralInput) {
    return this.prisma.referral.create({ data });
  }

  /**
   * Only updates a row that is still in `fromStatus` — `updateMany`'s
   * affected count (rather than a separate read-then-write) is the
   * concurrency guard: if the referral's status already changed between the
   * caller's `findById` and this call, the count comes back 0 and the
   * service turns that into a 409 instead of silently overwriting a
   * since-changed referral. Same pattern as closures/reopen-requests.
   */
  async updateStatus(
    id: string,
    fromStatus: 'PENDING_FOLLOWUP',
    toStatus: 'LAPSED' | 'COMPLETED',
  ): Promise<boolean> {
    const result = await this.prisma.referral.updateMany({
      where: { id, isDeleted: false, status: fromStatus },
      data: { status: toStatus },
    });
    return result.count > 0;
  }
}
