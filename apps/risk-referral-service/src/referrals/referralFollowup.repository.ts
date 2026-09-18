import type { PrismaService } from '../prisma/prisma.service';
import type { CreateReferralFollowupInput } from './dto/create-referral-followup.dto';
import type { RiskEntityType } from '../../../../node_modules/.prisma/client-risk-referral-service';

/** Thrown by `create()` when the referral is no longer PENDING_FOLLOWUP by
 * the time the transaction runs — see `create()`'s doc comment. */
export class ReferralNoLongerPendingFollowupError extends Error {}

/** Data access for referral follow-ups and their parent referral's status update. */
export class ReferralFollowupRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the follow-up row and updates the parent Referral's status in
   * one transaction — the two must land together, or a submitted follow-up
   * could exist with its parent referral still showing the pre-follow-up
   * status.
   *
   * The status update is guarded by `updateMany` re-checking
   * `status: 'PENDING_FOLLOWUP'` at commit time (same concurrency-guard
   * pattern as `ReferralRepository.updateStatus`/`updateType`), not a plain
   * `update({ where: { id } })` — the service layer's own PENDING_FOLLOWUP
   * check runs once, before this transaction starts, so without this guard
   * two concurrent follow-up submissions for the same referral (e.g. an
   * offline-sync retry racing a genuine second submission) could both pass
   * that check and both commit, creating two ReferralFollowup rows with no
   * error. A 0-count here throws `ReferralNoLongerPendingFollowupError`,
   * which the service maps to a 409 (PR #199 review).
   */
  async create(
    referralId: string,
    followupStatus: 'COMPLETED' | 'INCOMPLETE',
    referralStatus: 'COMPLETED' | 'PENDING_FOLLOWUP',
    data: Omit<CreateReferralFollowupInput, 'mediaAssetIds'>,
    createdByUserId: string,
    entity: { entityType: RiskEntityType; childId: string | null },
  ) {
    return this.prisma.$transaction(async (tx) => {
      // followupAttemptNumber (SRS 3C.4.1) is the 1-based sequence of this
      // row among all follow-ups for this referral, mirroring the "RFU1,
      // RFU2..." label the app form already computes and displays but
      // never persists. Counted inside this transaction, not read-then-
      // insert outside it, so two concurrent submissions for the same
      // referral can't both compute the same attempt number.
      const priorAttempts = await tx.referralFollowup.count({ where: { referralId } });
      const followup = await tx.referralFollowup.create({
        data: {
          ...data,
          referralId,
          followupStatus,
          createdByUserId,
          entityType: entity.entityType,
          childId: entity.childId,
          followupAttemptNumber: priorAttempts + 1,
        },
      });
      const updateResult = await tx.referral.updateMany({
        where: { id: referralId, status: 'PENDING_FOLLOWUP' },
        data: { status: referralStatus },
      });
      if (updateResult.count === 0) {
        throw new ReferralNoLongerPendingFollowupError();
      }
      const referral = await tx.referral.findUniqueOrThrow({ where: { id: referralId } });
      return { followup, referral };
    });
  }
}
