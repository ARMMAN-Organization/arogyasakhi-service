import { createHash } from 'node:crypto';
import { notFound } from '@armman/service-commons';
import type { RuleVersionRepository } from './ruleVersion.repository';
import type { PublishRuleVersionInput } from './dto/publish-ruleVersion.dto';

/** SHA-256 of the rules JSON, stored on rule_versions.checksum for change detection. */
export function computeChecksum(rulesJson: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(rulesJson)).digest();
}

/**
 * Projects a raw rule_versions row down to exactly the fields the API exposes —
 * drops the binary `checksum` and internal audit columns so they never leak.
 */
function toApiRuleVersion(v: Record<string, unknown>) {
  return {
    id: v.id,
    ruleSetId: v.ruleSetId,
    versionNo: v.versionNo,
    rulesJson: v.rulesJson,
    effectiveFrom: v.effectiveFrom,
    effectiveTo: v.effectiveTo,
    publishedByUserId: v.publishedByUserId,
    status: v.status,
  };
}

/** Rule-version domain logic: read the published version, publish a new one. */
export class RuleVersionService {
  constructor(private readonly repository: RuleVersionRepository) {}

  /** The currently-published version for a rule set; 404 if the set is unknown or unpublished. */
  async getPublished(ruleSetId: string) {
    const set = await this.repository.findSetById(ruleSetId);
    if (!set) throw notFound('Rule set not found.');

    const version = await this.repository.findPublishedBySetId(ruleSetId);
    if (!version) throw notFound('No published rule pack version found for this rule set.');
    return toApiRuleVersion(version as unknown as Record<string, unknown>);
  }

  /**
   * Publishes a new rule pack version for a set (create + publish in one step):
   * auto-increments versionNo, computes the checksum, marks it PUBLISHED as of
   * now, and retires the previously-published version. 404 if the set is unknown.
   */
  async publish(ruleSetId: string, dto: PublishRuleVersionInput, publishedByUserId: string | null) {
    const set = await this.repository.findSetById(ruleSetId);
    if (!set) throw notFound('Rule set not found.');

    const existingCount = await this.repository.countVersions(ruleSetId);
    const created = await this.repository.publishNewVersion({
      ruleSetId,
      versionNo: `v${existingCount + 1}`,
      rulesJson: dto.rulesJson,
      checksum: computeChecksum(dto.rulesJson),
      effectiveFrom: new Date(),
      publishedByUserId,
    });
    return toApiRuleVersion(created as unknown as Record<string, unknown>);
  }
}
