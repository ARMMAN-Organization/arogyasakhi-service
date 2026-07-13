import type { VisitInstanceRepository } from './visitInstance.repository';
import type { CreateVisitInstanceInput } from './dto/create-visitInstance.dto';

/** Visit instance domain logic. Data access is delegated to the repository. */
export class VisitInstanceService {
  constructor(private readonly repository: VisitInstanceRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateVisitInstanceInput) {
    return this.repository.create(dto);
  }
}
