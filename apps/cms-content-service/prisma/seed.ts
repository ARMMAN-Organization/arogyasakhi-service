import { PrismaClient } from '../../../node_modules/.prisma/client-cms-content-service';
import healthEducationMessages from './seed-data/health-education-messages.json';

const prisma = new PrismaClient();

// Fixed UUIDs (not @default(uuid()) at insert time) so every environment's
// seed run produces the same row — matches the pattern used for other
// fixed-id master data in this repo (e.g. rules-service's SCHEDULE_RULE_SET_ID).
const PLACEHOLDER_SECTION_ID = '66666666-6666-4666-8666-666666666661';
const PLACEHOLDER_TOPIC_ID = '66666666-6666-4666-8666-666666666662';

/**
 * "Content coming soon" placeholder — SRS Assumptions (line 166) and Open
 * Item 12 (line 601): "The feature shell will be built and deployed with a
 * 'Content coming soon' placeholder" until ARMMAN provides the real Learn
 * More content structure. `update: {}` on both upserts means this only ever
 * creates the rows on a fresh environment — once ARMMAN's real content
 * structure is confirmed, replace this seed with real sections/topics rather
 * than editing these rows in place.
 */
async function seedPlaceholderContent(): Promise<void> {
  await prisma.learnMoreSection.upsert({
    where: { id: PLACEHOLDER_SECTION_ID },
    create: {
      id: PLACEHOLDER_SECTION_ID,
      sectionCode: 'COMING_SOON',
      sectionName: 'Content coming soon',
      sortOrder: 0,
      status: 'ACTIVE',
    },
    update: {},
  });

  await prisma.learnMoreTopic.upsert({
    where: { id: PLACEHOLDER_TOPIC_ID },
    create: {
      id: PLACEHOLDER_TOPIC_ID,
      sectionId: PLACEHOLDER_SECTION_ID,
      topicCode: 'COMING_SOON',
      topicName: 'Content coming soon',
      mediaType: 'QNA_TEXT',
      contentUrl: null,
      sortOrder: 0,
      status: 'ACTIVE',
    },
    update: {},
  });
}

/**
 * Ingests ARMMAN's delivered health-education content (2026-08-28,
 * "Revised App Form Final 20.3.26 - Health education message.csv", 32
 * rows after dropping one genuinely blank spacer row). Every row's
 * riskConditionId is null in the seed data — manual matching against
 * risk-referral-service's real risk_conditions found no unambiguous match
 * for any of the CSV's ~21 condition names (even name-similar ones like
 * "Gestational Diabetes"/"Gestational Hypertension"/"Danger Signs during
 * Pregnancy" have real wording/scope mismatches with the actual seeded
 * risk_conditions rows) — confirmed by explicit product decision
 * (2026-08-28) not to force a guessed match. No cross-service lookup is
 * therefore needed here; if/when real per-condition linkage is confirmed,
 * that update happens directly on these seeded rows, not in this script.
 *
 * `update: {}` on the upsert means this only ever creates rows on a fresh
 * environment, matching seedPlaceholderContent()'s own convention above —
 * once real content/mappings are confirmed, edit the seed data and rely on
 * a fresh environment re-seed, not an in-place migration of live rows.
 */
async function seedHealthEducationMessages(): Promise<void> {
  for (const message of healthEducationMessages) {
    await prisma.healthEducationMessage.upsert({
      where: {
        conditionLabel_stage_messageOrder: {
          conditionLabel: message.conditionLabel,
          stage: message.stage,
          messageOrder: message.messageOrder,
        },
      },
      create: {
        riskConditionId: message.riskConditionId,
        conditionLabel: message.conditionLabel,
        stage: message.stage,
        messageOrder: message.messageOrder,
        titleEn: message.titleEn,
        bodyEn: message.bodyEn,
        mediaType: message.mediaType as 'TEXT' | 'IMAGE' | 'AUDIO' | 'VIDEO',
        mediaFile: message.mediaFile,
        sortOrder: message.sortOrder,
      },
      update: {},
    });
  }
}

async function main(): Promise<void> {
  await seedPlaceholderContent();
  await seedHealthEducationMessages();
  console.log('Seeded Learn More placeholder section + topic, and health education messages.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
