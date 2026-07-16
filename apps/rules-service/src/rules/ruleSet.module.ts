import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { RuleSetRepository } from './ruleSet.repository';
import { RuleSetService } from './ruleSet.service';
import { createRuleSetRouter } from './ruleSet.controller';

/**
 * Composition root for the rules feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createRuleSetModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RuleSetRepository(prisma);
  const service = new RuleSetService(repository);
  return createRuleSetRouter(service);
}
