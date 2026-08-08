import { notFound, unprocessable } from '@armman/service-commons';
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
   *
   * `findById` alone isn't enough to trust the pairing: a caller can
   * discover any active rate's id via `GET /incentive-rates/active` and
   * submit it with an unrelated `sourceEntityType`, or one that's expired/
   * not yet effective — closing "arbitrary amount" but not "any real rate's
   * amount, correct or not". This re-validates the fetched rate actually
   * applies to this event before trusting its amountInr.
   *
   * The effective-window check is anchored to the server's own clock, NOT
   * `dto.calculatedAt` — that field is entirely caller-supplied (see the
   * DTO), so gating eligibility on it would let a caller submit any
   * `calculatedAt` value to make an expired or not-yet-effective rate pass.
   * Rates are meant to be currently effective at the moment an event is
   * recorded, not effective as of whatever the client claims.
   *
   * Does NOT check `geographyUnitId` scope — no caller geography is wired
   * into this endpoint's request/auth context yet, so a rate meant for one
   * geography can still be paired with an event anywhere. Known gap, not
   * fixed here: closing it needs a caller-geography param on this endpoint,
   * a larger change than this validation tightening.
   */
  async create(dto: CreateIncentiveEventInput) {
    const rate = await this.rateRepository.findById(dto.rateId);
    if (!rate) throw notFound('Incentive rate not found.');

    if (rate.rateType !== dto.sourceEntityType) {
      throw unprocessable(
        `rateId does not refer to a ${dto.sourceEntityType} rate (it is ${rate.rateType}).`,
      );
    }
    const now = new Date();
    if (rate.effectiveFrom > now) {
      throw unprocessable('rateId does not refer to a currently effective rate.');
    }
    if (rate.effectiveTo && rate.effectiveTo < now) {
      throw unprocessable('rateId does not refer to a currently effective rate.');
    }

    return this.repository.create({ ...dto, amountInr: Number(rate.amountInr) });
  }
}
