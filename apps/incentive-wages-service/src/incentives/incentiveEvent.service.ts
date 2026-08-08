import { notFound } from '@armman/service-commons';
import type { IncentiveEventRepository } from './incentiveEvent.repository';
import type { IncentiveRateRepository } from '../rates/incentiveRate.repository';
import type { CreateIncentiveEventInput } from './dto/create-incentiveEvent.dto';

/** Incentive event domain logic. Data access is delegated to the repository. */
export class IncentiveEventService {
  constructor(
    private readonly repository: IncentiveEventRepository,
    private readonly rateRepository: IncentiveRateRepository,
  ) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * Re-derives amountInr from the referenced rate server-side — never
   * trusted from the request body (see createIncentiveEventSchema's doc
   * comment). Both ADMIN and SUPERVISOR can reach this endpoint (the latter
   * needed for the ACCOMPANIED_REFERRAL incentive trigger), so a client
   * choosing its own payout amount would otherwise be a privilege
   * escalation — any caller can pick a rateId, but not the amount it pays.
   */
  async create(dto: CreateIncentiveEventInput) {
    const rate = await this.rateRepository.findById(dto.rateId);
    if (!rate) throw notFound('Incentive rate not found.');

    return this.repository.create({ ...dto, amountInr: Number(rate.amountInr) });
  }
}
