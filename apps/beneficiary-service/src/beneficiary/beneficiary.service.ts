import type { BeneficiaryRepository } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';

/** Business logic for the beneficiary lifecycle. */
export class BeneficiaryService {
  constructor(private readonly repository: BeneficiaryRepository) {}

  /** Lists recent beneficiary cases (scope enforcement added with the auth layer). */
  list() {
    return this.repository.findMany();
  }

  /** Creates a beneficiary case. Duplicate detection is added with the rules layer. */
  create(dto: CreateBeneficiaryInput) {
    return this.repository.create(dto);
  }
}
