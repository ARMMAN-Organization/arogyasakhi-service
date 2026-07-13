import type { ReferralRepository } from './referral.repository';
import type { CreateReferralInput } from './dto/create-referral.dto';

/** Referral domain logic. Data access is delegated to the repository. */
export class ReferralService {
  constructor(private readonly repository: ReferralRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateReferralInput) {
    return this.repository.create(dto);
  }
}
