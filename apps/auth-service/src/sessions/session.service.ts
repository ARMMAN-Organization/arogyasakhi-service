import type { SessionRepository } from './session.repository';
import type { CreateSessionInput } from './dto/create-session.dto';

/** Session domain logic. Data access is delegated to the repository. */
export class SessionService {
  constructor(private readonly repository: SessionRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateSessionInput) {
    return this.repository.create(dto);
  }
}
