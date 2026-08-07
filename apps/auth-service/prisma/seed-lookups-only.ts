import { PrismaClient } from '../../../node_modules/.prisma/client-auth-service';
import { LOOKUP_CATEGORIES } from './seed-data';

const prisma = new PrismaClient();

/**
 * Standalone runner for just the lookup-category seed step (extracted from
 * seed.ts's seedLookups()). Skips any category that already exists by
 * categoryCode, so it's safe to run against an environment (e.g. dev) that
 * already has some categories seeded — it only creates what's missing, never
 * touches existing categories/values, and never runs the rest of seed.ts's
 * roles/users/geography/project steps.
 */
async function main(): Promise<void> {
  let createdCategories = 0;
  let createdValues = 0;
  const createdCodes: string[] = [];
  const skippedCodes: string[] = [];

  for (const category of LOOKUP_CATEGORIES) {
    const existing = await prisma.lookupCategory.findUnique({
      where: { categoryCode: category.categoryCode },
    });
    if (existing) {
      skippedCodes.push(category.categoryCode);
      continue;
    }

    await prisma.lookupCategory.create({
      data: {
        categoryCode: category.categoryCode,
        categoryName: category.categoryName,
        description: category.description,
        values: { createMany: { data: category.values } },
      },
    });
    createdCategories += 1;
    createdValues += category.values.length;
    createdCodes.push(category.categoryCode);
  }

  console.log('\nLookup seed summary:');
  console.log(
    `  Created ${createdCategories} categor${createdCategories === 1 ? 'y' : 'ies'} (${createdValues} values): ${createdCodes.join(', ') || 'none'}`,
  );
  console.log(`  Skipped (already existed): ${skippedCodes.join(', ') || 'none'}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
