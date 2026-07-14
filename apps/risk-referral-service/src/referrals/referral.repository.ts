import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReferralInput } from './dto/create-referral.dto';

/** Data access for referrals. Owns only this service's `referrals` table. */
export class ReferralRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.referral.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateReferralInput) {
    return this.prisma.referral.create({ data });
  }
}
