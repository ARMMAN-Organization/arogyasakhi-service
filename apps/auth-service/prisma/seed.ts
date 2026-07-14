import * as argon2 from 'argon2';
import { PrismaClient } from '../../../node_modules/.prisma/client-auth-service';

const prisma = new PrismaClient();

/**
 * Role master data (docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md,
 * Appendix A.1 "roles", line 337). This is real reference data required in
 * every environment, including production — not test data.
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
  {
    roleCode: 'CONTENT_MANAGER',
    roleName: 'Content Manager',
    description: 'Manages health education / Learn More content.',
  },
  {
    roleCode: 'ANALYST',
    roleName: 'Analyst',
    description: 'Creates/edits dashboards and reports.',
  },
  {
    roleCode: 'M_AND_E',
    roleName: 'Monitoring & Evaluation',
    description: 'Creates/edits dashboards and reports.',
  },
];

async function seedRoles(): Promise<void> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { roleCode: role.roleCode },
      update: { roleName: role.roleName, description: role.description },
      create: role,
    });
  }
  console.log(`Seeded ${ROLES.length} roles.`);
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

  const mobileNumber = '+919999999999';
  const passwordHash = await argon2.hash('Test@1234');

  const user = await prisma.user.upsert({
    where: { mobileNumber },
    update: {},
    create: {
      mobileNumber,
      passwordHash,
      displayName: 'Test Sakhi',
      status: 'ACTIVE',
    },
  });

  const sakhiRole = await prisma.role.findUniqueOrThrow({ where: { roleCode: 'SAKHI' } });

  // user_roles has no unique constraint on (userId, roleId) in the schema, so
  // this is a plain find-or-create rather than an upsert.
  const existingAssignment = await prisma.userRole.findFirst({
    where: { userId: user.id, roleId: sakhiRole.id },
  });
  if (!existingAssignment) {
    await prisma.userRole.create({
      data: { userId: user.id, roleId: sakhiRole.id, effectiveFrom: new Date(), status: 'ACTIVE' },
    });
  }

  console.log(`Seeded test user ${mobileNumber} (password: Test@1234) with SAKHI role.`);
}

async function main(): Promise<void> {
  await seedRoles();
  await seedTestUser();
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
