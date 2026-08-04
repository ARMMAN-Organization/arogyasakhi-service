import { createHash } from 'node:crypto';
import { PrismaClient } from '../../../node_modules/.prisma/client-rules-service';

const prisma = new PrismaClient();

// Fixed, hardcoded UUIDs (not @default(uuid()) at insert time) — the Sakhi
// mobile app hardcodes SCHEDULE_RULE_VERSION_ID in HardcodedRuleSource and
// must match exactly across dev/SIT/UAT, so every environment's seed run has
// to produce the same id rather than a fresh one per run.
const SCHEDULE_RULE_SET_ID = '11111111-1111-4111-8111-111111111111';
const SCHEDULE_RULE_VERSION_ID = '22222222-2222-4222-8222-222222222222';
const SCHEDULE_RULE_VERSION_NO = 'v1-hardcoded';

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
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
