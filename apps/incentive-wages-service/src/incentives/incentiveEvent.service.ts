import type { IncentiveEventRepository } from './incentiveEvent.repository';
import type { CreateIncentiveEventInput } from './dto/create-incentiveEvent.dto';

/** Incentive event domain logic. Data access is delegated to the repository. */
export class IncentiveEventService {
  constructor(private readonly repository: IncentiveEventRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateIncentiveEventInput) {
    return this.repository.create(dto);
  }
}
