import type { ClosureRepository } from './closure.repository';
import type { CreateClosureInput } from './dto/create-closure.dto';

/** Closure domain logic. Data access is delegated to the repository. */
export class ClosureService {
  constructor(private readonly repository: ClosureRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateClosureInput) {
    return this.repository.create(dto);
  }
}
