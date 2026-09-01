import { createHash } from 'node:crypto';
import { PrismaClient } from '../../../node_modules/.prisma/client-rules-service';
import { ancRulesJson } from '../src/rules/scheduling/anc.rulesJson';
import { ppRulesJson } from '../src/rules/scheduling/pp.rulesJson';
import { nnRulesJson } from '../src/rules/scheduling/nn.rulesJson';
import { incRulesJson } from '../src/rules/scheduling/inc.rulesJson';
import { ccvRulesJson } from '../src/rules/scheduling/ccv.rulesJson';
import { hrRulesJson } from '../src/rules/scheduling/hr.rulesJson';
import { deliveryRulesJson } from '../src/rules/scheduling/delivery.rulesJson';
import { escalationRulesJson } from '../src/rules/scheduling/escalation.rulesJson';
import { ancRiskRulesJson } from '../src/rules/scheduling/anc-risk.rulesJson';
import { infantRiskRulesJson } from '../src/rules/scheduling/infant-risk.rulesJson';

const prisma = new PrismaClient();

// Fixed, hardcoded UUIDs (not @default(uuid()) at insert time) — the Sakhi
// mobile app hardcodes SCHEDULE_RULE_VERSION_ID in HardcodedRuleSource and
// must match exactly across dev/SIT/UAT, so every environment's seed run has
// to produce the same id rather than a fresh one per run.
const SCHEDULE_RULE_SET_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULE_RULE_VERSION_ID = '22222222-2222-4222-8222-222222222222';
const SCHEDULE_RULE_VERSION_NO = 'v1-hardcoded';

/**
 * The seven real scheduling rule packs (SRS §3A.2.3, Appendix A/B/D/G),
 * seeded alongside — not replacing — the generic placeholder SCHEDULE set
 * above. Each gets its own fixed UUID pair (rule set + v1 published
 * version) so environments stay in sync, following the exact upsert-once
 * pattern used for SCHEDULE_RULE_SET_ID: `update: {}` on both upserts means
 * this only ever creates the rows on a fresh environment. A real change to
 * one of these packs is a new versionNo (a new row) via
 * POST /admin/rules/:setId/publish, never an edit of the seeded v1 here.
 */
const SCHEDULING_RULE_PACKS = [
  {
    ruleSetId: '33333333-3333-4333-8333-333333333331',
    ruleVersionId: '33333333-3333-4333-8333-333333333332',
    ruleSetName: 'Arogya Sakhi ANC Visit Scheduling',
    rulesJson: ancRulesJson,
  },
  {
    ruleSetId: '33333333-3333-4333-8333-333333333341',
    ruleVersionId: '33333333-3333-4333-8333-333333333342',
    ruleSetName: 'Arogya Sakhi PP Visit Scheduling',
    rulesJson: ppRulesJson,
  },
  {
    ruleSetId: '33333333-3333-4333-8333-333333333351',
    ruleVersionId: '33333333-3333-4333-8333-333333333352',
    ruleSetName: 'Arogya Sakhi NN Visit Scheduling',
    rulesJson: nnRulesJson,
  },
  {
    ruleSetId: '33333333-3333-4333-8333-333333333361',
    ruleVersionId: '33333333-3333-4333-8333-333333333362',
    ruleSetName: 'Arogya Sakhi INC Visit Scheduling',
    rulesJson: incRulesJson,
  },
  {
    ruleSetId: '33333333-3333-4333-8333-333333333371',
    ruleVersionId: '33333333-3333-4333-8333-333333333372',
    ruleSetName: 'Arogya Sakhi CCV Visit Scheduling',
    rulesJson: ccvRulesJson,
  },
  {
    ruleSetId: '33333333-3333-4333-8333-333333333381',
    ruleVersionId: '33333333-3333-4333-8333-333333333382',
    ruleSetName: 'Arogya Sakhi HR Visit Scheduling',
    rulesJson: hrRulesJson,
  },
  {
    ruleSetId: '33333333-3333-4333-8333-333333333391',
    ruleVersionId: '33333333-3333-4333-8333-333333333392',
    ruleSetName: 'Arogya Sakhi Delivery Combined Visit Scheduling',
    rulesJson: deliveryRulesJson,
  },
] as const;

async function seedSchedulingRulePacks(): Promise<void> {
  for (const pack of SCHEDULING_RULE_PACKS) {
    await prisma.ruleSet.upsert({
      where: { id: pack.ruleSetId },
      create: {
        id: pack.ruleSetId,
        ruleCategory: 'SCHEDULE',
        ruleSetName: pack.ruleSetName,
        status: 'ACTIVE',
      },
      update: {},
    });

    await prisma.ruleVersion.upsert({
      where: { id: pack.ruleVersionId },
      create: {
        id: pack.ruleVersionId,
        ruleSetId: pack.ruleSetId,
        versionNo: 'v1',
        rulesJson: pack.rulesJson,
        effectiveFrom: new Date('2026-08-10'),
        checksum: createHash('sha256').update(JSON.stringify(pack.rulesJson)).digest(),
        status: 'PUBLISHED',
      },
      update: {},
    });
  }
}

// Fixed UUID pair for the first (and currently only) ESCALATION rule pack
// (SRS §3A.2.7 FR-S-7.1) — a distinct prefix ('44444444...') from the
// SCHEDULE packs' '33333333...' family, since this is a different
// RuleCategory, not another scheduling journey. Same upsert-once pattern:
// `update: {}` on both upserts means this only ever creates the rows on a
// fresh environment.
const ESCALATION_RULE_PACKS = [
  {
    ruleSetId: '44444444-4444-4444-8444-444444444441',
    ruleVersionId: '44444444-4444-4444-8444-444444444442',
    ruleSetName: 'Arogya Sakhi Missed-Visit Escalation',
    rulesJson: escalationRulesJson,
  },
] as const;

async function seedEscalationRulePacks(): Promise<void> {
  for (const pack of ESCALATION_RULE_PACKS) {
    await prisma.ruleSet.upsert({
      where: { id: pack.ruleSetId },
      create: {
        id: pack.ruleSetId,
        ruleCategory: 'ESCALATION',
        ruleSetName: pack.ruleSetName,
        status: 'ACTIVE',
      },
      update: {},
    });

    await prisma.ruleVersion.upsert({
      where: { id: pack.ruleVersionId },
      create: {
        id: pack.ruleVersionId,
        ruleSetId: pack.ruleSetId,
        versionNo: 'v1',
        rulesJson: pack.rulesJson,
        effectiveFrom: new Date('2026-08-10'),
        checksum: createHash('sha256').update(JSON.stringify(pack.rulesJson)).digest(),
        status: 'PUBLISHED',
      },
      update: {},
    });
  }
}

// The two RISK-category clinical grading packs (ANC High-Risk grading /
// Infant High-Risk grading — see anc-risk.rulesJson.ts and
// infant-risk.rulesJson.ts's own doc comments). Previously created only via
// out-of-band POST /admin/rules calls in every environment, never by this
// seed script — meaning a fresh environment's ANC_VISIT/NEONATAL_VISIT/
// INC_VISIT/CCV_VISIT submissions had no risk-grading RuleSet to point at
// (visit-form-service's FormDefinition.riskRuleSetId had nothing to
// reference) until someone manually bootstrapped one. Fixed UUIDs (distinct
// '55555555...' prefix from SCHEDULE's '33333333...' / ESCALATION's
// '44444444...') so visit-form-service's seed (below) can wire
// FormDefinition.riskRuleSetId to a known id rather than a value discovered
// after the fact. Same upsert-once pattern as the packs above: `update: {}`
// only ever creates these on a fresh environment — an existing environment's
// already-published RuleVersion is never silently rewritten by re-seeding;
// a real content change is a new versionNo via POST /admin/rules/:setId/publish.
const RISK_RULE_PACKS = [
  {
    ruleSetId: '55555555-5555-4555-8555-555555555551',
    ruleVersionId: '55555555-5555-4555-8555-555555555552',
    ruleSetName: 'Arogya Sakhi ANC Clinical Risk Grading',
    rulesJson: ancRiskRulesJson,
  },
  {
    ruleSetId: '55555555-5555-4555-8555-555555555561',
    ruleVersionId: '55555555-5555-4555-8555-555555555562',
    ruleSetName: 'Arogya Sakhi Infant Clinical Risk Grading',
    rulesJson: infantRiskRulesJson,
  },
] as const;

async function seedRiskRulePacks(): Promise<void> {
  for (const pack of RISK_RULE_PACKS) {
    await prisma.ruleSet.upsert({
      where: { id: pack.ruleSetId },
      create: {
        id: pack.ruleSetId,
        ruleCategory: 'RISK',
        ruleSetName: pack.ruleSetName,
        status: 'ACTIVE',
      },
      update: {},
    });

    await prisma.ruleVersion.upsert({
      where: { id: pack.ruleVersionId },
      create: {
        id: pack.ruleVersionId,
        ruleSetId: pack.ruleSetId,
        versionNo: 'v1',
        rulesJson: pack.rulesJson,
        effectiveFrom: new Date('2026-08-10'),
        checksum: createHash('sha256').update(JSON.stringify(pack.rulesJson)).digest(),
        status: 'PUBLISHED',
      },
      update: {},
    });
  }
}

/**
 * Seeds the SCHEDULE rule set + its v1-hardcoded published version, so
 * VisitSchedule.generatedByRuleVersionId (NOT NULL, no default) has a real
 * row to reference for M2 — actual scheduling rules live in the Kotlin app's
 * HardcodedRuleSource today and move to GoRules packages in M3 (CR-032).
 */
async function seedScheduleRuleVersion(): Promise<void> {
  // update: {} is deliberate on both upserts — this only ever creates the row
  // on a fresh environment. Once it exists, re-running the seed must NOT
  // touch it: dev/SIT/UAT may already have real data (schedules, submissions)
  // referencing this exact row, and silently rewriting rulesJson/checksum/
  // effectiveFrom out from under them would be a live-data mutation disguised
  // as a seed. A real change to this rule version's content is a new
  // versionNo (a new row), not an edit of this one — matching the
  // create/immutable-then-supersede pattern used elsewhere in rules-service
  // (see ruleVersion.repository.ts's publishNewVersion).
  await prisma.ruleSet.upsert({
    where: { id: SCHEDULE_RULE_SET_ID },
    create: {
      id: SCHEDULE_RULE_SET_ID,
      ruleCategory: 'SCHEDULE',
      ruleSetName: 'Arogya Sakhi Visit Scheduling',
      status: 'ACTIVE',
    },
    update: {},
  });

  const rulesJson = {
    note: 'Rules implemented in sakhi-mobile-app HardcodedRuleSource. Replaced by GoRules packages in M3 (CR-032).',
  };

  await prisma.ruleVersion.upsert({
    where: { id: SCHEDULE_RULE_VERSION_ID },
    create: {
      id: SCHEDULE_RULE_VERSION_ID,
      ruleSetId: SCHEDULE_RULE_SET_ID,
      versionNo: SCHEDULE_RULE_VERSION_NO,
      rulesJson,
      effectiveFrom: new Date('2026-08-01'),
      checksum: createHash('sha256').update(JSON.stringify(rulesJson)).digest(),
      status: 'PUBLISHED',
    },
    update: {},
  });
}

async function main(): Promise<void> {
  await seedScheduleRuleVersion();
  console.log(`Seeded SCHEDULE rule version: ${SCHEDULE_RULE_VERSION_ID}`);

  await seedSchedulingRulePacks();
  console.log(
    `Seeded ${SCHEDULING_RULE_PACKS.length} scheduling rule packs (ANC/PP/NN/INC/CCV/HR/DELIVERY).`,
  );

  await seedEscalationRulePacks();
  console.log(`Seeded ${ESCALATION_RULE_PACKS.length} escalation rule pack(s).`);

  await seedRiskRulePacks();
  console.log(`Seeded ${RISK_RULE_PACKS.length} clinical risk-grading rule pack(s) (ANC/Infant).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
