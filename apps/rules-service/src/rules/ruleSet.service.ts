import { Injectable } from '@nestjs/common';
import { RuleSetRepository } from './ruleSet.repository';
import type { CreateRuleSetDto } from './dto/create-ruleSet.dto';

@Injectable()
export class RuleSetService {
  constructor(private readonly repository: RuleSetRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateRuleSetDto) { return this.repository.create(dto); }
}
