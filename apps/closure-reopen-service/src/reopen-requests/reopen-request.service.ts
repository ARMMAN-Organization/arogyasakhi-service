import { conflict, notFound } from '@armman/service-commons';
import type { ReopenRequestRepository } from './reopen-request.repository';
import type { DecideReopenRequestInput } from './dto/decide-reopen-request.dto';

/** Reopen request domain logic. Data access is delegated to the repository. */
export class ReopenRequestService {
  constructor(private readonly repository: ReopenRequestRepository) {}

  /**
   * Decides a Supervisor's reopen request (Quick Response's REOPEN card).
   * REJECTED is the persisted "Cannot re-open" state — the beneficiary
   * simply stays whatever Closed state it already had; no separate flag.
   */
  async decide(id: string, decidedByUserId: string, dto: DecideReopenRequestInput) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Reopen request not found.');
    if (existing.supervisorStatus !== 'PENDING') {
      throw conflict('This reopen request has already been decided.');
    }

    const updated = await this.repository.decide(id, decidedByUserId, dto);
    if (!updated) {
      // Raced with another decision between the read above and the
      // conditional update — same outcome as the check above, just caught a
      // beat later instead of trusting a stale read.
      throw conflict('This reopen request has already been decided.');
    }

    return this.repository.findById(id);
  }
}
