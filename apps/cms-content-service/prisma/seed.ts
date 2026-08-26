import { PrismaClient } from '../../../node_modules/.prisma/client-cms-content-service';

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

async function main(): Promise<void> {
  await seedPlaceholderContent();
  console.log('Seeded Learn More placeholder section + topic.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
