import type { PrismaService } from '../prisma/prisma.service';
import type { CreateRuleSetInput } from './dto/create-ruleSet.dto';

/** Data access for rule sets. Owns only this service's `rule_sets` table. */
export class RuleSetRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.ruleSet.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateRuleSetInput) {
    return this.prisma.ruleSet.create({ data });
  }
}
