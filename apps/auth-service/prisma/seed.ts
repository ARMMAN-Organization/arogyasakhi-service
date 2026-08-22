import * as argon2 from 'argon2';
import { z } from 'zod';
import { PrismaClient } from '../../../node_modules/.prisma/client-auth-service';
import {
  GEOGRAPHY_UNITS,
  LOOKUP_CATEGORIES,
  SEED_USER_ENV_VARS,
  type SeedResult,
} from './seed-data';
import { seedRoles, seedAdminUsers } from '../src/prisma/startup-seed';
import { resolveSupervisorId } from './seed-supervisor';

const prisma = new PrismaClient();

// Non-ADMIN test/dev users only (SAKHI/SUPERVISOR/MANAGER) — ADMIN + roles
// are seeded at app startup (src/prisma/startup-seed.ts) and reused here so
// running this script manually never drifts from what boot already does.
const MANUAL_SEED_USER_ENV_VARS = SEED_USER_ENV_VARS.filter((spec) => spec.roleCode !== 'ADMIN');

const seedUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  displayName: z.string().min(1),
  // SAKHI-only: resolved to sakhi_profiles.supervisor_id (see
  // seed-supervisor.ts). Ignored for other roles.
  supervisorUsername: z.string().min(1).optional(),
});

/**
 * Parses one role's env var (a JSON array of `{ username, password,
 * displayName }`). Throws with the env var name on malformed JSON or a
 * shape mismatch, per this repo's "fail fast on invalid config, never start
 * misconfigured" standard — a typo in deployment config should be loud, not
 * silently skipped.
 */
function parseSeedUsersEnv(envVar: string): z.infer<typeof seedUserSchema>[] {
  const raw = process.env[envVar];
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `${envVar} must be valid JSON (an array of {username, password, displayName}).`,
    );
  }

  const result = z.array(seedUserSchema).safeParse(parsed);
  if (!result.success) {
    throw new Error(`${envVar} is malformed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Finds the next free `+91900000<4-digit>` slot starting at `mobileOffset +
 * 1`, skipping any number already taken by a pre-existing row (this DB may
 * have other ad hoc users seeded outside this script's control). Bounded to
 * 1000 attempts — one offset band (e.g. SUPERVISOR's 100-199) — since running
 * out would mean the whole band is exhausted, which should surface as an
 * error rather than silently spill into the next role's band.
 */
async function nextFreeMobileNumber(mobileOffset: number, startIndex: number): Promise<string> {
  for (let i = startIndex; i < startIndex + 1000; i++) {
    const candidate = `+91900000${String(mobileOffset + i + 1).padStart(4, '0')}`;
    const existing = await prisma.user.findUnique({ where: { mobileNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error(`No free mobile number slot found for offset ${mobileOffset}.`);
}

/**
 * Seeds test/dev users for one role from its env var (SAKHI/SUPERVISOR/
 * MANAGER only — ADMIN is seeded at app startup, see src/prisma/startup-seed.ts).
 * Always skipped when NODE_ENV=production, since these are dev/test
 * fixtures, not master data. A user already existing by username is left
 * untouched (never re-created, password never rotated by the seed).
 * mobileNumber is not part of the env payload (login is username + password
 * only) — it's derived deterministically so re-running the seed is stable.
 * `scope.projectId`/`scope.geographyUnitId` are assigned on the created
 * user_roles row so a fresh environment's seeded users are immediately
 * usable end-to-end (e.g. POST /visits needs a real project/geography scope)
 * instead of surfacing as projectId: null, geographyUnitId: null on login.
 */
async function seedUsersFromEnv(
  spec: { envVar: string; roleCode: string; mobileOffset: number },
  scope: { projectId: string; geographyUnitId: string },
): Promise<SeedResult[]> {
  if (process.env.NODE_ENV === 'production') {
    return [
      {
        step: `seedUser:${spec.envVar}`,
        created: false,
        message: 'NODE_ENV=production — skipped.',
      },
    ];
  }

  const users = parseSeedUsersEnv(spec.envVar);
  if (users.length === 0) {
    return [
      {
        step: `seedUser:${spec.envVar}`,
        created: false,
        message: `${spec.envVar} not set or empty — skipped.`,
      },
    ];
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { roleCode: spec.roleCode } });
  const results: SeedResult[] = [];

  for (const [index, user] of users.entries()) {
    const existing = await prisma.user.findUnique({ where: { username: user.username } });
    if (existing) {
      results.push({
        step: `seedUser:${user.username}`,
        created: false,
        message: `User ${user.username} already exists — skipped.`,
      });
      continue;
    }

    // Resolved before the transaction so a bad supervisorUsername fails the
    // whole step loudly instead of leaving a half-created user behind.
    const supervisorId = user.supervisorUsername
      ? await resolveSupervisorId(prisma, user.supervisorUsername)
      : undefined;

    const passwordHash = await argon2.hash(user.password);
    const mobileNumber = await nextFreeMobileNumber(spec.mobileOffset, index);

    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: user.username,
          mobileNumber,
          passwordHash,
          displayName: user.displayName,
          status: 'ACTIVE',
        },
      });
      await tx.userRole.create({
        data: {
          userId: created.id,
          roleId: role.id,
          projectId: scope.projectId,
          geographyUnitId: scope.geographyUnitId,
          effectiveFrom: new Date(),
          status: 'ACTIVE',
        },
      });
      if (supervisorId) {
        // phoneNumber reuses the same deterministic mobile number as the
        // user row — seed fixtures have no other phone number to draw on,
        // and sakhi_profiles.phone_number carries no uniqueness constraint.
        await tx.sakhiProfile.create({
          data: {
            userId: created.id,
            primaryProjectId: scope.projectId,
            phoneNumber: mobileNumber,
            supervisorId,
            activeFrom: new Date(),
          },
        });
      }
    });

    results.push({
      step: `seedUser:${user.username}`,
      created: true,
      message: supervisorId
        ? `Seeded ${spec.roleCode} user ${user.username} (mobile ${mobileNumber}, project ${scope.projectId}, geography ${scope.geographyUnitId}, supervisor ${user.supervisorUsername}).`
        : `Seeded ${spec.roleCode} user ${user.username} (mobile ${mobileNumber}, project ${scope.projectId}, geography ${scope.geographyUnitId}).`,
    });
  }

  return results;
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
/**
 * Returns the leaf unit's (last entry in GEOGRAPHY_UNITS — Test Pada)
 * geographyUnitId alongside the usual result, so callers can assign seeded
 * test users to a real geography scope instead of leaving it null.
 */
async function seedGeographyUnits(): Promise<SeedResult & { leafGeographyUnitId: string }> {
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

  const leafGeographyUnitId = idByCode.get(GEOGRAPHY_UNITS[GEOGRAPHY_UNITS.length - 1].geoCode);
  if (!leafGeographyUnitId) {
    throw new Error('seedGeographyUnits: leaf unit was not created or found — cannot continue.');
  }

  if (created === 0) {
    return {
      step: 'geographyUnits',
      created: false,
      message: 'All geography units already present — skipped.',
      leafGeographyUnitId,
    };
  }
  return {
    step: 'geographyUnits',
    created: true,
    message: `Seeded ${created} geography unit(s).`,
    leafGeographyUnitId,
  };
}

const TEST_PROJECT_CODE = 'TEST-PROJ-SEED-01';

/**
 * A single test/dev Project so seeded SAKHI/SUPERVISOR/MANAGER users get a
 * real projectId on their user_roles row instead of null — without this,
 * every fresh environment produces users whose token/`/me` response shows
 * projectId: null, geographyUnitId: null, which is what surfaced the gap
 * this function fixes.
 */
async function seedTestProject(): Promise<SeedResult & { projectId: string }> {
  const existing = await prisma.project.findUnique({ where: { projectCode: TEST_PROJECT_CODE } });
  if (existing) {
    return {
      step: 'testProject',
      created: false,
      message: `Test project ${TEST_PROJECT_CODE} already exists — skipped.`,
      projectId: existing.projectId,
    };
  }

  const project = await prisma.project.create({
    data: {
      projectCode: TEST_PROJECT_CODE,
      projectName: 'Test Project (seeded)',
      financialYear: '2026-2027',
      startDate: new Date('2026-01-01'),
      status: 'ACTIVE',
    },
  });

  return {
    step: 'testProject',
    created: true,
    message: `Seeded test project ${TEST_PROJECT_CODE}.`,
    projectId: project.projectId,
  };
}

/**
 * Links the test project to its full geography chain (leaf unit + every
 * ancestor up to the state) via `project_geographies`. Without this, a
 * client that scopes its offline geography-unit download to the project
 * (see `GET /project-geography`) silently excludes every record tied to
 * this geography — the exact gap that made freshly-seeded beneficiaries
 * invisible on the mobile app despite the API returning them correctly.
 */
async function seedProjectGeography(
  projectId: string,
  leafGeographyUnitId: string,
): Promise<SeedResult> {
  const chain: string[] = [];
  let currentId: string | null = leafGeographyUnitId;
  while (currentId) {
    chain.push(currentId);
    const unit: { parentId: string | null } | null = await prisma.geographyUnit.findUnique({
      where: { geographyUnitId: currentId },
      select: { parentId: true },
    });
    currentId = unit?.parentId ?? null;
  }

  let created = 0;
  let skipped = 0;
  for (const geographyUnitId of chain) {
    const existing = await prisma.projectGeography.findFirst({
      where: { projectId, geographyUnitId, isDeleted: false },
    });
    if (existing) {
      skipped += 1;
      continue;
    }
    await prisma.projectGeography.create({
      data: { projectId, geographyUnitId, activeFrom: new Date('2026-01-01') },
    });
    created += 1;
  }

  return {
    step: 'projectGeography',
    created: created > 0,
    message: `Linked ${created} geography unit(s) to the test project, skipped ${skipped} already-linked.`,
  };
}

interface SupervisorAppAccountSeed {
  id: string;
  username: string;
  password: string;
  displayName: string;
  mobileNumber: string;
  roleCode: 'SUPERVISOR' | 'SAKHI';
  supervisorId?: string;
}

// Supervisor-app QA fixture: 6 supervisors + 5 sakhis, fixed ids matching what
// beneficiary-service/visit-form-service/supervisor-operations-service/
// approval-service/notification-escalation-service's own seed.ts files
// already hardcode as cross-service references — unlike the generic
// SUPERVISOR/SAKHI env-var mechanism above (which mints new random ids on
// every fresh database), these fixed ids make the whole seed suite portable:
// running `npm run seed` on any environment reproduces this exact dataset,
// wired together correctly.
const SUPERVISOR_APP_ACCOUNTS: SupervisorAppAccountSeed[] = [
  {
    id: '742e8dfe-984c-4c9f-af24-c3dacffecac4',
    username: 'arun.supervisor',
    password: 'Arun@1234',
    displayName: 'Arun Supervisor',
    mobileNumber: '+919100000001',
    roleCode: 'SUPERVISOR',
  },
  {
    id: '40f6e942-2101-426b-9251-947e7db9f869',
    username: 'suresh.supervisor',
    password: 'Suresh@1234',
    displayName: 'Suresh Supervisor',
    mobileNumber: '+919100000002',
    roleCode: 'SUPERVISOR',
  },
  {
    id: '55cdb187-12e5-475f-902c-c4bf50d4e220',
    username: 'deepak.supervisor',
    password: 'Deepak@1234',
    displayName: 'Deepak Supervisor',
    mobileNumber: '+919100000003',
    roleCode: 'SUPERVISOR',
  },
  {
    id: '6242e4ae-19c8-4a4b-b7ca-63768fff1615',
    username: 'vijay.supervisor',
    password: 'Vijay@1234',
    displayName: 'Vijay Supervisor',
    mobileNumber: '+919100000004',
    roleCode: 'SUPERVISOR',
  },
  {
    id: '23002b65-40c3-45e2-9c6d-76d1c42b0053',
    username: 'manoj.supervisor',
    password: 'Manoj@1234',
    displayName: 'Manoj Supervisor',
    mobileNumber: '+919100000005',
    roleCode: 'SUPERVISOR',
  },
  {
    id: '11925f16-4399-47a2-977b-ef06e89acd94',
    username: 'raj.supervisor',
    password: 'Str0ngPass!23',
    displayName: 'Raj Supervisor',
    mobileNumber: '+919800000106',
    roleCode: 'SUPERVISOR',
  },
  {
    id: '3df86ec1-8115-4db9-b558-a091f15b5a99',
    username: 'lakshmi.sakhi',
    password: 'lakshmi@123',
    displayName: 'Lakshmi Sakhi',
    mobileNumber: '+919100000011',
    roleCode: 'SAKHI',
    supervisorId: '742e8dfe-984c-4c9f-af24-c3dacffecac4',
  },
  {
    id: '9252ff42-6904-4005-9184-14cbbb75e84b',
    username: 'nithya.sakhi',
    password: 'nithya@123',
    displayName: 'Nithya Sakhi',
    mobileNumber: '+919100000012',
    roleCode: 'SAKHI',
    supervisorId: '40f6e942-2101-426b-9251-947e7db9f869',
  },
  {
    id: 'f84745fd-f105-40d9-bbf0-9127b3948112',
    username: 'sandhya.sakhi',
    password: 'sandhya@123',
    displayName: 'Sandhya Sakhi',
    mobileNumber: '+919100000013',
    roleCode: 'SAKHI',
    supervisorId: '55cdb187-12e5-475f-902c-c4bf50d4e220',
  },
  {
    id: '079bd637-01a7-45f1-9216-fa819b736e54',
    username: 'revathi.sakhi',
    password: 'revathi@123',
    displayName: 'Revathi Sakhi',
    mobileNumber: '+919100000014',
    roleCode: 'SAKHI',
    supervisorId: '6242e4ae-19c8-4a4b-b7ca-63768fff1615',
  },
  {
    id: '63407922-ecb4-4812-be4e-4567938bfb20',
    username: 'shobana.sakhi',
    password: 'shobana@123',
    displayName: 'Shobana Sakhi',
    mobileNumber: '+919100000015',
    roleCode: 'SAKHI',
    supervisorId: '23002b65-40c3-45e2-9c6d-76d1c42b0053',
  },
];

async function seedSupervisorAppAccounts(scope: {
  projectId: string;
  geographyUnitId: string;
}): Promise<SeedResult[]> {
  if (process.env.NODE_ENV === 'production') {
    return [
      { step: 'supervisorAppAccounts', created: false, message: 'NODE_ENV=production — skipped.' },
    ];
  }

  const roles = await prisma.role.findMany({
    where: { roleCode: { in: ['SUPERVISOR', 'SAKHI'] } },
  });
  const roleIdByCode = new Map(roles.map((r) => [r.roleCode, r.id]));
  const results: SeedResult[] = [];

  for (const account of SUPERVISOR_APP_ACCOUNTS) {
    const existing = await prisma.user.findUnique({ where: { id: account.id } });
    if (existing) {
      results.push({
        step: `supervisorAppAccount:${account.username}`,
        created: false,
        message: `User ${account.username} already exists — skipped.`,
      });
      continue;
    }

    const roleId = roleIdByCode.get(account.roleCode);
    if (!roleId) {
      throw new Error(`Role ${account.roleCode} not found — run seedRoles first.`);
    }
    const passwordHash = await argon2.hash(account.password);

    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: account.id,
          username: account.username,
          mobileNumber: account.mobileNumber,
          passwordHash,
          displayName: account.displayName,
          status: 'ACTIVE',
        },
      });
      await tx.userRole.create({
        data: {
          userId: account.id,
          roleId,
          projectId: scope.projectId,
          geographyUnitId: scope.geographyUnitId,
          effectiveFrom: new Date(),
          status: 'ACTIVE',
        },
      });
      if (account.roleCode === 'SAKHI') {
        await tx.sakhiProfile.create({
          data: {
            userId: account.id,
            primaryProjectId: scope.projectId,
            phoneNumber: account.mobileNumber,
            supervisorId: account.supervisorId,
            activeFrom: new Date(),
          },
        });
      }
    });

    results.push({
      step: `supervisorAppAccount:${account.username}`,
      created: true,
      message: `Seeded ${account.roleCode} user ${account.username} (id ${account.id}).`,
    });
  }

  return results;
}

async function main(): Promise<void> {
  const results = [await seedRoles(prisma), ...(await seedAdminUsers(prisma))];

  // Geography + project must exist before seeding users, so their
  // user_roles row can be assigned a real projectId/geographyUnitId instead
  // of null.
  const geographyResult = await seedGeographyUnits();
  const projectResult = await seedTestProject();
  results.push(geographyResult, projectResult);
  results.push(
    await seedProjectGeography(projectResult.projectId, geographyResult.leafGeographyUnitId),
  );
  results.push(
    ...(await seedSupervisorAppAccounts({
      projectId: projectResult.projectId,
      geographyUnitId: geographyResult.leafGeographyUnitId,
    })),
  );

  for (const spec of MANUAL_SEED_USER_ENV_VARS) {
    results.push(
      ...(await seedUsersFromEnv(spec, {
        projectId: projectResult.projectId,
        geographyUnitId: geographyResult.leafGeographyUnitId,
      })),
    );
  }
  results.push(await seedLookups());

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
