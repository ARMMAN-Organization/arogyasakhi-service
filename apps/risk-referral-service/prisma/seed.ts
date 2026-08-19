import { PrismaClient } from '../../../node_modules/.prisma/client-risk-referral-service';
import selfReportedConditions from './seed-data/self-reported-conditions.json';
import riskParameters from './seed-data/risk-parameters.json';
import ancRiskConditions from './seed-data/anc-risk-conditions.json';
import infantRiskConditions from './seed-data/infant-risk-conditions.json';

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

interface RiskParameterSeed {
  parameterCode: string;
  parameterName: string;
  entityType: 'MOTHER' | 'CHILD';
  unit: string | null;
  dataType: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL';
}

interface AncRiskConditionSeed {
  conditionCode: string;
  conditionName: string;
  gradeScale: 'BINARY' | 'NORMAL_MILD_MODERATE_SEVERE' | 'NORMAL_LOW_MEDIUM_HIGH';
  referralRequiredDefault: boolean;
  educationRequiredDefault: boolean;
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

/**
 * Master data for the raw measurable clinical parameters (e.g. systolic BP,
 * hemoglobin) that feed a rules-service rule evaluation — distinct from
 * RiskCondition, which is the resulting diagnosed/flagged condition after
 * grading. Content lives in ./seed-data/risk-parameters.json, based on the
 * observedValueJson keys referenced in apps/rules-service (e.g. systolicBp,
 * hemoglobin — see ruleVersion.routes.ts) and the corresponding question
 * codes in apps/visit-form-service/prisma/seed-data (anc-visit.json,
 * postpartum-visit.json, infant-visit.json).
 */
async function seedRiskParameters(): Promise<SeedResult> {
  let createdCount = 0;

  for (const parameter of riskParameters as RiskParameterSeed[]) {
    const existing = await prisma.riskParameter.findUnique({
      where: { parameterCode: parameter.parameterCode },
    });
    if (existing) continue;

    await prisma.riskParameter.create({
      data: {
        parameterCode: parameter.parameterCode,
        parameterName: parameter.parameterName,
        entityType: parameter.entityType,
        unit: parameter.unit,
        dataType: parameter.dataType,
        status: 'ACTIVE',
      },
    });
    createdCount += 1;
  }

  if (createdCount === 0) {
    return {
      step: 'risk-parameters',
      created: false,
      message: 'All risk parameter rows already present — skipped.',
    };
  }
  return {
    step: 'risk-parameters',
    created: true,
    message: `Seeded ${createdCount} risk parameter row(s).`,
  };
}

/**
 * Master data for the 18 ANC High-Risk conditions defined in Appendix D
 * ("High risk protocols_Developer's copy - ANC HR", see
 * docs/Appendix_D_High_Risk_Detection_Rules.md, Part 1). `phase: ANC` — these
 * feed the anc-risk.rulesJson.ts RISK rule pack via a conditionCode ->
 * risk_condition_id map that riskAssessment.service.ts builds by looking
 * these rows up before calling evaluateRuleSet.
 */
async function seedAncRiskConditions(): Promise<SeedResult> {
  let createdCount = 0;

  for (const condition of ancRiskConditions as AncRiskConditionSeed[]) {
    const existing = await prisma.riskCondition.findUnique({
      where: { conditionCode: condition.conditionCode },
    });
    if (existing) continue;

    await prisma.riskCondition.create({
      data: {
        conditionCode: condition.conditionCode,
        conditionName: condition.conditionName,
        entityType: 'MOTHER',
        phase: 'ANC',
        gradeScale: condition.gradeScale,
        referralRequiredDefault: condition.referralRequiredDefault,
        educationRequiredDefault: condition.educationRequiredDefault,
        status: 'ACTIVE',
      },
    });
    createdCount += 1;
  }

  if (createdCount === 0) {
    return {
      step: 'anc-risk-conditions',
      created: false,
      message: 'All ANC risk condition rows already present — skipped.',
    };
  }
  return {
    step: 'anc-risk-conditions',
    created: true,
    message: `Seeded ${createdCount} ANC risk condition row(s).`,
  };
}

/**
 * Master data for the 10 Infant High-Risk conditions defined in Appendix D
 * ("High risk protocols_Developer's copy - Infant HR", see
 * docs/Appendix_D_High_Risk_Detection_Rules.md, Part 2). Seeded once under
 * `phase: INC` — condition_code has a global UNIQUE constraint (not
 * unique-per-phase), and per SRS §3A.2.4 CCV reuses INC's thresholds
 * verbatim, so both CCV_VISIT and NN (NEONATAL_VISIT) evaluations pass
 * riskPhase: 'INC' to reuse this same seeded set rather than duplicating
 * rows per phase (see infant-risk.rulesJson.ts's own doc comment).
 */
async function seedInfantRiskConditions(): Promise<SeedResult> {
  let createdCount = 0;

  for (const condition of infantRiskConditions as AncRiskConditionSeed[]) {
    const existing = await prisma.riskCondition.findUnique({
      where: { conditionCode: condition.conditionCode },
    });
    if (existing) continue;

    await prisma.riskCondition.create({
      data: {
        conditionCode: condition.conditionCode,
        conditionName: condition.conditionName,
        entityType: 'CHILD',
        phase: 'INC',
        gradeScale: condition.gradeScale,
        referralRequiredDefault: condition.referralRequiredDefault,
        educationRequiredDefault: condition.educationRequiredDefault,
        status: 'ACTIVE',
      },
    });
    createdCount += 1;
  }

  if (createdCount === 0) {
    return {
      step: 'infant-risk-conditions',
      created: false,
      message: 'All infant risk condition rows already present — skipped.',
    };
  }
  return {
    step: 'infant-risk-conditions',
    created: true,
    message: `Seeded ${createdCount} infant risk condition row(s).`,
  };
}

async function main(): Promise<void> {
  const results = [
    await seedSelfReportedConditions(),
    await seedRiskParameters(),
    await seedAncRiskConditions(),
    await seedInfantRiskConditions(),
  ];

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
