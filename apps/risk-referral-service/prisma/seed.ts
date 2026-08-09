import { PrismaClient } from '../../../node_modules/.prisma/client-risk-referral-service';
import selfReportedConditions from './seed-data/self-reported-conditions.json';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

interface SelfReportedConditionSeed {
  conditionCode: string;
  conditionName: string;
}

/**
 * Master data for the self-reported medical conditions and sickle cell
 * statuses captured at enrollment (MOTHER_REGISTRATION Q58/Q60) — these have
 * no grading rule set (gradeScale BINARY, referral/education defaults false)
 * since they're history reported by the mother, not an evaluated risk.
 * Content lives in ./seed-data/self-reported-conditions.json, transcribed
 * from the MOTHER_REGISTRATION form's Q58/Q60 positive answer codes (see
 * apps/visit-form-service/prisma/seed-data/mother-registration.json).
 */
async function seedSelfReportedConditions(): Promise<SeedResult> {
  let createdCount = 0;

  for (const condition of selfReportedConditions as SelfReportedConditionSeed[]) {
    const existing = await prisma.riskCondition.findUnique({
      where: { conditionCode: condition.conditionCode },
    });
    if (existing) continue;

    await prisma.riskCondition.create({
      data: {
        conditionCode: condition.conditionCode,
        conditionName: condition.conditionName,
        entityType: 'MOTHER',
        phase: 'REGISTRATION',
        gradeScale: 'BINARY',
        referralRequiredDefault: false,
        educationRequiredDefault: false,
        status: 'ACTIVE',
      },
    });
    createdCount += 1;
  }

  if (createdCount === 0) {
    return {
      step: 'self-reported-conditions',
      created: false,
      message: 'All self-reported condition rows already present — skipped.',
    };
  }
  return {
    step: 'self-reported-conditions',
    created: true,
    message: `Seeded ${createdCount} self-reported condition row(s).`,
  };
}

async function main(): Promise<void> {
  const results = [await seedSelfReportedConditions()];

  console.log('\nSeed summary:');
  for (const r of results) {
    console.log(`  [${r.created ? 'created' : 'skipped'}] ${r.step}: ${r.message}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
