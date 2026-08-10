import { createHash } from 'node:crypto';
import { conflict, notFound } from '@armman/service-commons';
import type { RuleVersionRepository } from './ruleVersion.repository';
import type { PublishRuleVersionInput } from './dto/publish-ruleVersion.dto';
import type { EvaluateRuleSetInput } from './dto/evaluate-ruleSet.dto';
import type { EvaluateScheduleInput } from './dto/evaluate-schedule.dto';
import { evaluateRulePack } from './ruleSet.evaluator';
import { evaluateSchedulePack } from './scheduleEvaluator';

/** Prisma unique-constraint violation code (ruleSetId + versionNo). */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';
/** Prisma serialization-failure code (SERIALIZABLE transaction conflict). */
const PRISMA_SERIALIZATION_FAILURE_CODE = 'P2034';

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

  /**
   * A rule version's id/ruleSetId/status by its own id — open to any
   * authenticated role (unlike getPublished/publish, which are ADMIN-only),
   * since other services need to verify a caller-supplied
   * generatedByRuleVersionId is real and PUBLISHED without needing rules
   * admin access themselves. Deliberately omits rulesJson/checksum.
   */
  async getById(id: string) {
    const version = await this.repository.findById(id);
    if (!version) throw notFound('Rule version not found.');
    return {
      id: version.id,
      ruleSetId: version.ruleSetId,
      status: version.status,
    };
  }

  /** The currently-published version for a rule set; 404 if the set is unknown or unpublished. */
  async getPublished(ruleSetId: string) {
    const set = await this.repository.findSetById(ruleSetId);
    if (!set) throw notFound('Rule set not found.');

    const version = await this.repository.findPublishedBySetId(ruleSetId);
    if (!version) throw notFound('No published rule pack version found for this rule set.');
    return toApiRuleVersion(version as unknown as Record<string, unknown>);
  }

  /**
   * Executes the rule set's currently-published gorules decision graph
   * against the caller-supplied answers — the "Central GoRules execution"
   * this service's own purpose statement (package.json/.claude/CLAUDE.md)
   * describes, previously unimplemented (this service only stored rule
   * packs opaquely; nothing interpreted rulesJson until now).
   *
   * 404 if the set doesn't exist, and a separate 404 if it exists but has no
   * published version — same two-step check as getPublished() just above,
   * so a stale/typo'd ruleSetId is distinguishable from a real set that
   * simply hasn't been published yet. Never silently evaluates against a
   * DRAFT (an unreviewed rule pack must not affect real risk grading).
   * Returns the published version's own id as `ruleVersionId` alongside the
   * results, so the caller (risk-referral-service) can record which rule
   * version produced a given RiskAssessment.
   */
  async evaluate(ruleSetId: string, dto: EvaluateRuleSetInput) {
    const set = await this.repository.findSetById(ruleSetId);
    if (!set) throw notFound('Rule set not found.');

    const version = await this.repository.findPublishedBySetId(ruleSetId);
    if (!version) {
      throw notFound('No published rule pack version found for this rule set.');
    }

    const evaluation = await evaluateRulePack(version.rulesJson, dto.answers);
    return { ruleVersionId: version.id, ...evaluation };
  }

  /**
   * Executes the rule set's currently-published gorules decision graph as a
   * SCHEDULE-category pack (ANC/PP/NN/INC/CCV/HR/DELIVERY per SRS §3A.2.3,
   * Appendix A/B/G) — same 404-on-missing-set/missing-published-version
   * guard as evaluate(), but validates the output against the shape
   * scheduleEvaluator.ts expects for the caller-supplied scheduleKind
   * rather than the RISK-only {overallRiskCategory, conditions} contract.
   */
  async evaluateSchedule(ruleSetId: string, dto: EvaluateScheduleInput) {
    const set = await this.repository.findSetById(ruleSetId);
    if (!set) throw notFound('Rule set not found.');

    const version = await this.repository.findPublishedBySetId(ruleSetId);
    if (!version) {
      throw notFound('No published rule pack version found for this rule set.');
    }

    const evaluation = await evaluateSchedulePack(dto.scheduleKind, version.rulesJson, dto.input);
    return { ruleVersionId: version.id, ...evaluation };
  }

  /**
   * Publishes a new rule pack version for a set (create + publish in one step):
   * auto-increments versionNo, computes the checksum, marks it PUBLISHED as of
   * now, and retires the previously-published version. 404 if the set is
   * unknown; 409 if a concurrent publish() for the same set raced this one
   * (see ruleVersion.repository.ts publishNewVersion for how the race is
   * detected — this only translates it to a clean HTTP error).
   */
  async publish(ruleSetId: string, dto: PublishRuleVersionInput, publishedByUserId: string | null) {
    const set = await this.repository.findSetById(ruleSetId);
    if (!set) throw notFound('Rule set not found.');

    try {
      const created = await this.repository.publishNewVersion({
        ruleSetId,
        rulesJson: dto.rulesJson,
        checksum: computeChecksum(dto.rulesJson),
        effectiveFrom: new Date(),
        publishedByUserId,
      });
      return toApiRuleVersion(created as unknown as Record<string, unknown>);
    } catch (err) {
      if (isConcurrentPublishConflict(err)) {
        throw conflict('Another publish for this rule set is in progress. Please retry.');
      }
      throw err;
    }
  }
}

/** Narrows a caught Prisma error to a concurrent-publish race (P2002 or P2034). */
function isConcurrentPublishConflict(err: unknown): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  const code = (err as { code: unknown }).code;
  return code === PRISMA_UNIQUE_CONSTRAINT_CODE || code === PRISMA_SERIALIZATION_FAILURE_CODE;
}
