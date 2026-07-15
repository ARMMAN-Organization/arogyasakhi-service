import * as argon2 from 'argon2';
import { PrismaClient } from '../../../node_modules/.prisma/client-auth-service';

const prisma = new PrismaClient();

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

async function seedRoles(): Promise<void> {
  // Only seed when the roles table is empty (e.g. first boot on a fresh DB).
  // Once roles exist, leave them untouched so runtime edits are never reverted.
  const existingCount = await prisma.role.count();
  if (existingCount > 0) {
    console.log(`Roles already present (${existingCount}) — skipping role seed.`);
    return;
  }

  await prisma.role.createMany({ data: ROLES });
  console.log(`Seeded ${ROLES.length} roles.`);
}

/**
 * Bootstraps the initial ADMIN user from environment variables so no admin
 * credential is ever hardcoded in the repo. Runs in every environment
 * (including production) when ADMIN_USERNAME, ADMIN_MOBILE_NUMBER, and
 * ADMIN_PASSWORD are all set; if any is missing it logs a notice and skips,
 * so a fresh env is never blocked from seeding. Only creates the admin when
 * no user with that username exists yet — an existing user is left
 * untouched (never re-created and never has its password rotated by the
 * seed). Login is username + password only, for every role; mobileNumber is
 * stored as a real `users` column (per the ERD) but never used to
 * authenticate.
 */
async function seedAdminUser(): Promise<void> {
  const username = process.env.ADMIN_USERNAME;
  const mobileNumber = process.env.ADMIN_MOBILE_NUMBER;
  const password = process.env.ADMIN_PASSWORD;

  if (!username || !mobileNumber || !password) {
    console.log(
      'ADMIN_USERNAME / ADMIN_MOBILE_NUMBER / ADMIN_PASSWORD not set — skipping admin bootstrap.',
    );
    return;
  }

  if (!/^\+91\d{10}$/.test(mobileNumber)) {
    throw new Error('ADMIN_MOBILE_NUMBER must be in the format +91XXXXXXXXXX.');
  }

  // Seed only when this admin does not already exist.
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`Admin user ${username} already exists — skipping admin bootstrap.`);
    return;
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

  console.log(`Seeded ADMIN user ${username}.`);
}

/**
 * A single local-login test user, gated to non-production environments only.
 * Never runs against production — this is test data, not master data.
 */
async function seedTestUser(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    console.log('NODE_ENV=production — skipping test user seed.');
    return;
  }

  const username = 'test.sakhi';
  const mobileNumber = '+919000000001';

  // Seed only when this test user does not already exist.
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`Test user ${username} already exists — skipping test user seed.`);
    return;
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

  console.log(`Seeded test user ${username} (password: Test@1234) with SAKHI role.`);
}

async function main(): Promise<void> {
  await seedRoles();
  await seedAdminUser();
  await seedTestUser();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
