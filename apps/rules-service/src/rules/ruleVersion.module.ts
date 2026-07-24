import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { RuleVersionRepository } from './ruleVersion.repository';
import { RuleVersionService } from './ruleVersion.service';
import { createRuleVersionRouter } from './ruleVersion.controller';

/**
 * Composition root for the rule-version feature: wires repository → service →
 * router. Serves the HLD's rule-pack version-fetch and publish endpoints under
 * the `/admin/rules` gateway prefix.
 */
export function createRuleVersionModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RuleVersionRepository(prisma);
  const service = new RuleVersionService(repository);
  return createRuleVersionRouter(service);
}
