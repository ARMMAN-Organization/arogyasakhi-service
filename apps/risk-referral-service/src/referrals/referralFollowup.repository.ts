import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReferralFollowupInput } from './dto/create-referral-followup.dto';

/** Data access for referral follow-ups and their parent referral's status update. */
export class ReferralFollowupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the follow-up row and updates the parent Referral's status in
   * one transaction — the two must land together, or a submitted follow-up
   * could exist with its parent referral still showing the pre-follow-up
   * status.
   */
  async create(
    referralId: string,
    followupStatus: 'COMPLETED' | 'INCOMPLETE',
    referralStatus: 'COMPLETED' | 'PENDING_FOLLOWUP',
    data: CreateReferralFollowupInput,
    createdByUserId: string,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const followup = await tx.referralFollowup.create({
        data: { ...data, referralId, followupStatus, createdByUserId },
      });
      const referral = await tx.referral.update({
        where: { id: referralId },
        data: { status: referralStatus },
      });
      return { followup, referral };
    });
  }
}
