import * as argon2 from 'argon2';
import { PrismaClient } from '../../../node_modules/.prisma/client-auth-service';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

/**
 * Role master data — the 4 user classes defined in
 * docs/Arogya_Sakhi_SRS_v3.0.md §2.2 "User Classes and Characteristics"
 * (Arogya Sakhi, Supervisor, Program Manager, System Administrator). The SRS
 * is authoritative over the ERD for this project; the ERD's roles.role_code
 * enum lists three additional codes (CONTENT_MANAGER, ANALYST, M_AND_E) that
 * are not SRS user classes and are intentionally excluded here. This is real
 * reference data required in every environment, including production — not
 * test data.
 */
const ROLES: { roleCode: string; roleName: string; description: string }[] = [
  {
    roleCode: 'SAKHI',
    roleName: 'Arogya Sakhi',
    description: 'Community health worker — field enrolment and visits.',
  },
  {
    roleCode: 'SUPERVISOR',
    roleName: 'Supervisor',
    description: 'Supervises a set of Arogya Sakhis.',
  },
  {
    roleCode: 'MANAGER',
    roleName: 'Program Manager',
    description: 'Program-level monitoring and reporting.',
  },
  { roleCode: 'ADMIN', roleName: 'Administrator', description: 'Platform administration.' },
];

async function seedRoles(): Promise<SeedResult> {
  // Only seed when the roles table is empty (e.g. first boot on a fresh DB).
  // Once roles exist, leave them untouched so runtime edits are never reverted.
  const existingCount = await prisma.role.count();
  if (existingCount > 0) {
    return {
      step: 'roles',
      created: false,
      message: `Roles already present (${existingCount}) — skipped.`,
    };
  }

  await prisma.role.createMany({ data: ROLES });
  return { step: 'roles', created: true, message: `Seeded ${ROLES.length} roles.` };
}

/**
 * Bootstraps the initial ADMIN user from environment variables so no admin
 * credential is ever hardcoded in the repo. Runs in every environment
 * (including production) when ADMIN_USERNAME, ADMIN_MOBILE_NUMBER, and
 * ADMIN_PASSWORD are all set; if any is missing it returns a skipped result,
 * so a fresh env is never blocked from seeding. Only creates the admin when
 * no user with that username exists yet — an existing user is left
 * untouched (never re-created and never has its password rotated by the
 * seed). Login is username + password only, for every role; mobileNumber is
 * stored as a real `users` column (per the ERD) but never used to
 * authenticate.
 */
async function seedAdminUser(): Promise<SeedResult> {
  const username = process.env.ADMIN_USERNAME;
  const mobileNumber = process.env.ADMIN_MOBILE_NUMBER;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !mobileNumber || !password) {
    return {
      step: 'admin',
      created: false,
      message: 'ADMIN_USERNAME / ADMIN_MOBILE_NUMBER / ADMIN_PASSWORD not set — skipped.',
    };
  }

  if (!/^\+91\d{10}$/.test(mobileNumber)) {
    throw new Error('ADMIN_MOBILE_NUMBER must be in the format +91XXXXXXXXXX.');
  }

  // Seed only when this admin does not already exist.
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return {
      step: 'admin',
      created: false,
      message: `Admin user ${username} already exists — skipped.`,
    };
  }

  const passwordHash = await argon2.hash(password);
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { roleCode: 'ADMIN' } });

  // Create the user and their ADMIN role assignment atomically.
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        mobileNumber,
        passwordHash,
        displayName: 'System Administrator',
        status: 'ACTIVE',
      },
    });
    await tx.userRole.create({
      data: { userId: user.id, roleId: adminRole.id, effectiveFrom: new Date(), status: 'ACTIVE' },
    });
  });

  return { step: 'admin', created: true, message: `Seeded ADMIN user ${username}.` };
}

/**
 * A single local-login test user, gated to non-production environments only.
 * Never runs against production — this is test data, not master data.
 */
async function seedTestUser(): Promise<SeedResult> {
  if (process.env.NODE_ENV === 'production') {
    return { step: 'testUser', created: false, message: 'NODE_ENV=production — skipped.' };
  }

  const username = 'test.sakhi';
  const mobileNumber = '+919000000001';

  // Seed only when this test user does not already exist.
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    return {
      step: 'testUser',
      created: false,
      message: `Test user ${username} already exists — skipped.`,
    };
  }

  const passwordHash = await argon2.hash('Test@1234');
  const sakhiRole = await prisma.role.findUniqueOrThrow({ where: { roleCode: 'SAKHI' } });

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        username,
        mobileNumber,
        passwordHash,
        displayName: 'Test Sakhi',
        status: 'ACTIVE',
      },
    });
    await tx.userRole.create({
      data: { userId: user.id, roleId: sakhiRole.id, effectiveFrom: new Date(), status: 'ACTIVE' },
    });
  });

  return {
    step: 'testUser',
    created: true,
    message: `Seeded test user ${username} (password: Test@1234) with SAKHI role.`,
  };
}

/**
 * Lookup category/value master data — dropdown options used across forms
 * per the ERD's lookup_categories/lookup_values design (docs/
 * Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md, line 794 lists
 * SEX/PHONE_OWNER/EDUCATION_LEVEL/VISIT_STATUS/REFERRAL_TYPE/RISK_GRADE/
 * CLOSURE_REASON as the example categories).
 *
 * value_code for VISIT_STATUS/REFERRAL_TYPE/CLOSURE_REASON matches the
 * member names of the Postgres enums they replace 1:1 (VisitInstanceStatus,
 * ReferralType, ClosureReason), so each service's migration can backfill its
 * new lookup-value-id column by looking up the row with a matching code.
 *
 * PHONE_OWNER and EDUCATION_LEVEL have no confirmed source yet — the SRS
 * cites an external "Revised App Form Final (20 March 2026)" Excel document
 * as the authoritative source for these two categories' values, and that
 * document is not available in this repo. The values below are provisional
 * placeholders (common options in Indian maternal-health programs) and MUST
 * be reviewed/replaced once the real source document is available.
 */
const LOOKUP_CATEGORIES: {
  categoryCode: string;
  categoryName: string;
  description: string;
  values: { valueCode: string; valueLabel: string; sortOrder: number }[];
}[] = [
  {
    categoryCode: 'SEX',
    categoryName: 'Sex',
    description: 'Shared sex value set for both adult (mother/caregiver) and child records.',
    values: [
      { valueCode: 'FEMALE', valueLabel: 'Female', sortOrder: 0 },
      { valueCode: 'MALE', valueLabel: 'Male', sortOrder: 1 },
      { valueCode: 'OTHER', valueLabel: 'Other', sortOrder: 2 },
      { valueCode: 'INTERSEX', valueLabel: 'Intersex', sortOrder: 3 },
    ],
  },
  {
    categoryCode: 'PHONE_OWNER',
    categoryName: 'Phone Owner',
    description:
      'PROVISIONAL — placeholder values pending the "Revised App Form Final (20 March 2026)" source document.',
    values: [
      { valueCode: 'SELF', valueLabel: 'Self', sortOrder: 0 },
      { valueCode: 'HUSBAND', valueLabel: 'Husband', sortOrder: 1 },
      { valueCode: 'FATHER_IN_LAW', valueLabel: 'Father-in-law', sortOrder: 2 },
      { valueCode: 'OTHER_FAMILY_MEMBER', valueLabel: 'Other family member', sortOrder: 3 },
    ],
  },
  {
    categoryCode: 'EDUCATION_LEVEL',
    categoryName: 'Education Level',
    description:
      'PROVISIONAL — placeholder values pending the "Revised App Form Final (20 March 2026)" source document.',
    values: [
      { valueCode: 'ILLITERATE', valueLabel: 'Illiterate', sortOrder: 0 },
      { valueCode: 'PRIMARY', valueLabel: 'Primary', sortOrder: 1 },
      { valueCode: 'SECONDARY', valueLabel: 'Secondary', sortOrder: 2 },
      { valueCode: 'HIGHER_SECONDARY', valueLabel: 'Higher secondary', sortOrder: 3 },
      { valueCode: 'GRADUATE', valueLabel: 'Graduate', sortOrder: 4 },
      { valueCode: 'POST_GRADUATE', valueLabel: 'Post-graduate', sortOrder: 5 },
    ],
  },
  {
    categoryCode: 'RISK_GRADE',
    categoryName: 'Risk Grade',
    description:
      'Evaluated risk grade for a condition at a visit (risk-referral-service risk_flags).',
    values: [
      { valueCode: 'NORMAL', valueLabel: 'Normal', sortOrder: 0 },
      { valueCode: 'MILD', valueLabel: 'Mild', sortOrder: 1 },
      { valueCode: 'MODERATE', valueLabel: 'Moderate', sortOrder: 2 },
      { valueCode: 'SEVERE', valueLabel: 'Severe', sortOrder: 3 },
      { valueCode: 'HIGH', valueLabel: 'High', sortOrder: 4 },
      { valueCode: 'CRITICAL', valueLabel: 'Critical', sortOrder: 5 },
    ],
  },
  {
    categoryCode: 'VISIT_STATUS',
    categoryName: 'Visit Status',
    description: "Replaces visit-form-service's VisitInstanceStatus Postgres enum.",
    values: [
      { valueCode: 'STARTED', valueLabel: 'Started', sortOrder: 0 },
      { valueCode: 'PENDING', valueLabel: 'Pending', sortOrder: 1 },
      { valueCode: 'MISSED', valueLabel: 'Missed', sortOrder: 2 },
      { valueCode: 'COMPLETED', valueLabel: 'Completed', sortOrder: 3 },
      { valueCode: 'DISCARDED', valueLabel: 'Discarded', sortOrder: 4 },
    ],
  },
  {
    categoryCode: 'REFERRAL_TYPE',
    categoryName: 'Referral Type',
    description: "Replaces risk-referral-service's ReferralType Postgres enum.",
    values: [
      { valueCode: 'STANDARD', valueLabel: 'Standard', sortOrder: 0 },
      { valueCode: 'ACCOMPANIED', valueLabel: 'Accompanied', sortOrder: 1 },
    ],
  },
  {
    categoryCode: 'CLOSURE_REASON',
    categoryName: 'Closure Reason',
    description: "Replaces closure-reopen-service's ClosureReason Postgres enum.",
    values: [
      { valueCode: 'MISCARRIAGE', valueLabel: 'Miscarriage', sortOrder: 0 },
      { valueCode: 'ABORTION', valueLabel: 'Abortion', sortOrder: 1 },
      { valueCode: 'MATERNAL_DEATH', valueLabel: 'Maternal death', sortOrder: 2 },
      { valueCode: 'INFANT_OR_CHILD_DEATH', valueLabel: 'Infant or child death', sortOrder: 3 },
      { valueCode: 'MIGRATION', valueLabel: 'Migration', sortOrder: 4 },
      { valueCode: 'WITHDRAWAL', valueLabel: 'Withdrawal', sortOrder: 5 },
      { valueCode: 'PROGRAM_CYCLE_COMPLETED', valueLabel: 'Program cycle completed', sortOrder: 6 },
      { valueCode: 'OTHER', valueLabel: 'Other', sortOrder: 7 },
    ],
  },
];

async function seedLookups(): Promise<SeedResult> {
  let createdCategories = 0;
  let createdValues = 0;

  for (const category of LOOKUP_CATEGORIES) {
    const existing = await prisma.lookupCategory.findUnique({
      where: { categoryCode: category.categoryCode },
    });
    if (existing) continue;

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
  }

  if (createdCategories === 0) {
    return {
      step: 'lookups',
      created: false,
      message: 'All lookup categories already present — skipped.',
    };
  }
  return {
    step: 'lookups',
    created: true,
    message: `Seeded ${createdCategories} lookup categor${createdCategories === 1 ? 'y' : 'ies'} (${createdValues} values).`,
  };
}

async function main(): Promise<void> {
  const results = [
    await seedRoles(),
    await seedAdminUser(),
    await seedTestUser(),
    await seedLookups(),
  ];

  console.log('\nSeed summary:');
  for (const r of results) {
    console.log(`  [${r.created ? 'created' : 'skipped'}] ${r.step}: ${r.message}`);
  }

  const createdCount = results.filter((r) => r.created).length;
  console.log(`\n${createdCount}/${results.length} step(s) created new data.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
