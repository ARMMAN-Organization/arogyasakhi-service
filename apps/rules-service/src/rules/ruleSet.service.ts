import type { RuleSetRepository } from './ruleSet.repository';
import type { CreateRuleSetInput } from './dto/create-ruleSet.dto';

/** Rule set domain logic. Data access is delegated to the repository. */
export class RuleSetService {
  constructor(private readonly repository: RuleSetRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateRuleSetInput) {
    return this.repository.create(dto);
  }
}
