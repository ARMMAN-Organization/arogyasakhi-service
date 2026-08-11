import { createHash } from 'node:crypto';
import { PrismaClient } from '../../../node_modules/.prisma/client-rules-service';
import { COMBINED_SCHEDULE_DECISION_GRAPH } from '../src/rules/graphs/combinedSchedule.graph';
import { ESCALATION_DECISION_GRAPH } from '../src/rules/graphs/escalation.graph';

const prisma = new PrismaClient();

// Fixed, hardcoded UUIDs (not @default(uuid()) at insert time) — the Sakhi
// mobile app hardcodes SCHEDULE_RULE_VERSION_ID in HardcodedRuleSource and
// must match exactly across dev/SIT/UAT, so every environment's seed run has
// to produce the same id rather than a fresh one per run.
const SCHEDULE_RULE_SET_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULE_RULE_VERSION_ID = '22222222-2222-4222-8222-222222222222';
const SCHEDULE_RULE_VERSION_NO = 'v1-hardcoded';

// New rule set — nothing hardcodes this yet (no existing consumer wires up
// escalation evaluation in production flow); a fresh id is fine here.
const ESCALATION_RULE_SET_ID = '33333333-3333-4333-8333-333333333333';
const ESCALATION_RULE_VERSION_ID = '44444444-4444-4444-8444-444444444444';
const ESCALATION_RULE_VERSION_NO = 'v1';

/**
 * Seeds the SCHEDULE rule set + its v1-hardcoded published version, so
 * VisitSchedule.generatedByRuleVersionId (NOT NULL, no default) has a real
 * row to reference. rulesJson is now the real ANC/PP/NN/INC/CCV decision
 * graph (SRS v3.0 §3A.2.3, CR-032) — previously a placeholder note pointing
 * at the mobile app's HardcodedRuleSource.
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

  const rulesJson = COMBINED_SCHEDULE_DECISION_GRAPH;

  await prisma.ruleVersion.upsert({
    where: { id: SCHEDULE_RULE_VERSION_ID },
    create: {
      id: SCHEDULE_RULE_VERSION_ID,
      ruleSetId: SCHEDULE_RULE_SET_ID,
      versionNo: SCHEDULE_RULE_VERSION_NO,
      rulesJson: rulesJson as never,
      effectiveFrom: new Date('2026-08-01'),
      checksum: createHash('sha256').update(JSON.stringify(rulesJson)).digest(),
      status: 'PUBLISHED',
    },
    update: {},
  });
}

/**
 * Seeds the ESCALATION rule set + its v1 published version — the
 * consolidated Supervisor-escalation thresholds (SRS v3.0 §3A.2.3
 * FR-S-3.5/3.6 and the PP/NN/INC/CCV miss rules). Same create-only upsert
 * pattern as seedScheduleRuleVersion: re-running the seed never mutates an
 * existing row.
 */
async function seedEscalationRuleVersion(): Promise<void> {
  await prisma.ruleSet.upsert({
    where: { id: ESCALATION_RULE_SET_ID },
    create: {
      id: ESCALATION_RULE_SET_ID,
      ruleCategory: 'ESCALATION',
      ruleSetName: 'Arogya Sakhi Visit Miss Escalation',
      status: 'ACTIVE',
    },
    update: {},
  });

  const rulesJson = ESCALATION_DECISION_GRAPH;

  await prisma.ruleVersion.upsert({
    where: { id: ESCALATION_RULE_VERSION_ID },
    create: {
      id: ESCALATION_RULE_VERSION_ID,
      ruleSetId: ESCALATION_RULE_SET_ID,
      versionNo: ESCALATION_RULE_VERSION_NO,
      rulesJson: rulesJson as never,
      effectiveFrom: new Date('2026-08-01'),
      checksum: createHash('sha256').update(JSON.stringify(rulesJson)).digest(),
      status: 'PUBLISHED',
    },
    update: {},
  });
}

async function main(): Promise<void> {
  await seedScheduleRuleVersion();
  await seedEscalationRuleVersion();
  console.log(`Seeded SCHEDULE rule version: ${SCHEDULE_RULE_VERSION_ID}`);
  console.log(`Seeded ESCALATION rule version: ${ESCALATION_RULE_VERSION_ID}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
