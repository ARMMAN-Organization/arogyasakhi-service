import { conflict, notFound } from '@armman/service-commons';
import type { ReferralRepository } from './referral.repository';
import type { CreateReferralInput } from './dto/create-referral.dto';
import type { DecideReferralInput } from './dto/decide-referral.dto';

/** Referral domain logic. Data access is delegated to the repository. */
export class ReferralService {
  constructor(private readonly repository: ReferralRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateReferralInput) {
    return this.repository.create(dto);
  }

  /**
   * Decides a referral per two Quick Response card outcomes:
   * - LAPSE (FR-SV-4.5 approve): PENDING_FOLLOWUP -> LAPSED.
   * - REFILL (FR-SV-4.5 reject): no status change — the referral stays
   *   PENDING_FOLLOWUP so the Sakhi can refill the follow-up form. Still
   *   validates the referral exists and is actually PENDING_FOLLOWUP, so a
   *   caller can't "refill" a referral that was never in that state.
   * - COMPLETE (FR-SV-4.9 approve): PENDING_FOLLOWUP -> COMPLETED.
   *
   * Both real status transitions use the same PENDING_FOLLOWUP-only
   * conditional update — a referral not in that state 409s rather than
   * silently no-op'ing.
   */
  async decide(id: string, dto: DecideReferralInput) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Referral not found.');
    if (existing.status !== 'PENDING_FOLLOWUP') {
      throw conflict(`Cannot decide a referral with status ${existing.status}.`);
    }

    if (dto.decision === 'REFILL') {
      return existing;
    }

    const toStatus = dto.decision === 'LAPSE' ? 'LAPSED' : 'COMPLETED';
    const updated = await this.repository.updateStatus(id, 'PENDING_FOLLOWUP', toStatus);
    if (!updated) {
      // Raced with another decision between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict(`Cannot decide a referral with status ${existing.status}.`);
    }

    const decided = await this.repository.findById(id);
    if (!decided) throw notFound('Referral not found.');
    return decided;
  }
}
