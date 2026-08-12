import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { RuleVersionRepository } from './ruleVersion.repository';
import { RuleVersionService } from './ruleVersion.service';
import { registerRuleVersionRoutes } from './ruleVersion.routes';

/**
 * Composition root for the rule-version feature: wires repository → service →
 * routes. Serves the HLD's rule-pack version-fetch and publish endpoints under
 * the `/admin/rules` gateway prefix.
 */
export function createRuleVersionModule(prisma: PrismaService): DocumentedRouter {
  const repository = new RuleVersionRepository(prisma);
  const service = new RuleVersionService(repository);
  const doc = createDocumentedRouter();
  registerRuleVersionRoutes(doc, service);
  return doc;
}
