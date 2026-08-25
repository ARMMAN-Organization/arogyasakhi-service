import { createHash } from 'node:crypto';
import { badRequest, conflict, notFound } from '@armman/service-commons';
import type { RuleVersionRepository } from './ruleVersion.repository';
import type { PublishRuleVersionInput } from './dto/publish-ruleVersion.dto';
import type { EvaluateRuleSetInput } from './dto/evaluate-ruleSet.dto';
import type { EvaluateScheduleInput } from './dto/evaluate-schedule.dto';
import type { EvaluateEscalationInput } from './dto/evaluate-escalation.dto';
import { evaluateRulePack } from './ruleSet.evaluator';
import { evaluateSchedulePack } from './scheduleEvaluator';
import { evaluateEscalationPack } from './escalationEvaluator';

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
   * The currently-published version's id for a rule set — open to any
   * authenticated role (unlike getPublished, which is ADMIN-only and also
   * returns the full rulesJson/checksum), so a mobile client can resolve
   * "which versionId is published for this rule set" without rules-admin
   * access. Same two-step 404 as getPublished()/evaluate() (unknown set vs.
   * never-published set are both 404, distinguishable only by message).
   */
  async getPublishedVersionId(ruleSetId: string) {
    const set = await this.repository.findSetById(ruleSetId);
    if (!set) throw notFound('Rule set not found.');

    const version = await this.repository.findPublishedBySetId(ruleSetId);
    if (!version) throw notFound('No published rule pack version found for this rule set.');
    return { versionId: version.id };
  }

  /**
   * A rule version's full rulesJson content by its own id — open to any
   * authenticated role, so a mobile client can fetch the JDM decision graph
   * for on-device evaluation (SCHEDULE or RISK) without rules-admin access.
   * Unlike getById() (which deliberately omits rulesJson for a lightweight
   * existence/status check), this is the one non-admin route that returns
   * the actual decision graph — 404s on a DRAFT/RETIRED version exactly like
   * a non-existent id, so an unpublished rule pack's existence is never
   * revealed to a non-admin caller (same posture as getPublished()/evaluate()
   * never evaluating against a DRAFT).
   */
  async getContentById(id: string) {
    const version = await this.repository.findById(id);
    if (!version || version.status !== 'PUBLISHED') {
      throw notFound('Rule version not found.');
    }
    return {
      id: version.id,
      ruleSetId: version.ruleSetId,
      versionNo: version.versionNo,
      rulesJson: version.rulesJson,
      status: version.status,
    };
  }

  /**
   * The currently-published content for a batch of rule sets in one call —
   * a mobile client's full sync (SCHEDULE ×6 + RISK ×2 today) resolved in
   * one round trip instead of one getPublishedVersionId + getContentById
   * pair per rule set. A ruleSetId with no published version (unknown id,
   * or never published) is simply omitted from the result array — never
   * errors the whole batch for one missing/unpublished set, since the
   * caller's other rule sets should still sync successfully.
   */
  async getPublishedContentBatch(ruleSetIds: string[]) {
    const versions = await this.repository.findPublishedManyBySetIds(ruleSetIds);
    return versions.map((version) => ({
      ruleSetId: version.ruleSetId,
      versionId: version.id,
      versionNo: version.versionNo,
      rulesJson: version.rulesJson,
      status: version.status,
    }));
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
    if (set.ruleCategory !== 'RISK') {
      throw badRequest(`This rule set is ${set.ruleCategory}, not RISK — cannot evaluate it here.`);
    }

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
    if (set.ruleCategory !== 'SCHEDULE') {
      throw badRequest(
        `This rule set is ${set.ruleCategory}, not SCHEDULE — cannot evaluate it here.`,
      );
    }

    const version = await this.repository.findPublishedBySetId(ruleSetId);
    if (!version) {
      throw notFound('No published rule pack version found for this rule set.');
    }

    const evaluation = await evaluateSchedulePack(dto.scheduleKind, version.rulesJson, dto.input);
    return { ruleVersionId: version.id, ...evaluation };
  }

  /**
   * Executes the rule set's currently-published gorules decision graph as an
   * ESCALATION-category pack (SRS §3A.2.7 FR-S-7.1) — same 404-on-missing-
   * set/missing-published-version guard as evaluate()/evaluateSchedule(),
   * but validates the output against escalationEvaluator.ts's single fixed
   * `{ shouldEscalate, reasonCode }` contract rather than a per-scheduleKind
   * shape.
   */
  async evaluateEscalation(ruleSetId: string, dto: EvaluateEscalationInput) {
    const set = await this.repository.findSetById(ruleSetId);
    if (!set) throw notFound('Rule set not found.');
    if (set.ruleCategory !== 'ESCALATION') {
      throw badRequest(
        `This rule set is ${set.ruleCategory}, not ESCALATION — cannot evaluate it here.`,
      );
    }

    const version = await this.repository.findPublishedBySetId(ruleSetId);
    if (!version) {
      throw notFound('No published rule pack version found for this rule set.');
    }

    const evaluation = await evaluateEscalationPack(version.rulesJson, dto.input);
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
