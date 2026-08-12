import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { RuleSetRepository } from './ruleSet.repository';
import { RuleSetService } from './ruleSet.service';
import { registerRuleSetRoutes } from './ruleSet.routes';

/**
 * Composition root for the rules feature: wires repository → service → routes.
 * Replaces the former NestJS module + DI container.
 */
export function createRuleSetModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RuleSetRepository(prisma);
  const service = new RuleSetService(repository);
  const doc = createDocumentedRouter();
  registerRuleSetRoutes(doc, service);
  return doc;
}
