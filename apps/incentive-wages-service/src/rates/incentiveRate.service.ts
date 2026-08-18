import type { IncentiveRateRepository } from './incentiveRate.repository';
import type { ListActiveRateQuery } from './dto/list-active-rate.dto';

/** Incentive rate domain logic. Data access is delegated to the repository. */
export class IncentiveRateService {
  constructor(private readonly repository: IncentiveRateRepository) {}

  /** The full rate master list, for offline reference (Master Data Download). */
  findAll() {
    return this.repository.findAll();
  }

  findActive(query: ListActiveRateQuery) {
    return this.repository.findActiveRate(
      query.rateType,
      query.referralType,
      query.geographyUnitId,
      query.asOf ?? new Date(),
    );
  }
}
