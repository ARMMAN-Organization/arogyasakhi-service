import * as argon2 from 'argon2';
import { PrismaClient } from '../../../node_modules/.prisma/client-auth-service';
import { GEOGRAPHY_UNITS, LOOKUP_CATEGORIES, ROLES, type SeedResult } from './seed-data';

const prisma = new PrismaClient();

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

/**
 * Minimal geography_units chain (State > District > Block > PHC > Sub-centre
 * > Village > Pada) so POST /beneficiaries has real villageId/padaId/etc. to
 * reference. Test/dev data only — see GEOGRAPHY_UNITS' doc comment.
 * Inserted in hierarchy order (each row's parentCode must already exist)
 * since parentId is a self-relation FK.
 */
async function seedGeographyUnits(): Promise<SeedResult> {
  let created = 0;
  const idByCode = new Map<string, string>();

  for (const unit of GEOGRAPHY_UNITS) {
    const existing = await prisma.geographyUnit.findFirst({
      where: { geoCode: unit.geoCode, geoType: unit.geoType },
    });
    if (existing) {
      idByCode.set(unit.geoCode, existing.geographyUnitId);
      continue;
    }

    const parentId = unit.parentCode ? idByCode.get(unit.parentCode) : null;
    const row = await prisma.geographyUnit.create({
      data: {
        geoCode: unit.geoCode,
        name: unit.name,
        geoType: unit.geoType,
        parentId: parentId ?? null,
      },
    });
    idByCode.set(unit.geoCode, row.geographyUnitId);
    created += 1;
  }

  if (created === 0) {
    return {
      step: 'geographyUnits',
      created: false,
      message: 'All geography units already present — skipped.',
    };
  }
  return {
    step: 'geographyUnits',
    created: true,
    message: `Seeded ${created} geography unit(s).`,
  };
}

async function main(): Promise<void> {
  const results = [
    await seedRoles(),
    await seedAdminUser(),
    await seedTestUser(),
    await seedLookups(),
    await seedGeographyUnits(),
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
