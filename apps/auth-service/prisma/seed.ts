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

const prisma = new PrismaClient();

// Non-ADMIN test/dev users only (SAKHI/SUPERVISOR/MANAGER) — ADMIN + roles
// are seeded at app startup (src/prisma/startup-seed.ts) and reused here so
// running this script manually never drifts from what boot already does.
const MANUAL_SEED_USER_ENV_VARS = SEED_USER_ENV_VARS.filter((spec) => spec.roleCode !== 'ADMIN');

const seedUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  displayName: z.string().min(1),
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
    });

    results.push({
      step: `seedUser:${user.username}`,
      created: true,
      message: `Seeded ${spec.roleCode} user ${user.username} (mobile ${mobileNumber}, project ${scope.projectId}, geography ${scope.geographyUnitId}).`,
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

async function main(): Promise<void> {
  const results = [await seedRoles(prisma), ...(await seedAdminUsers(prisma))];

  // Geography + project must exist before seeding users, so their
  // user_roles row can be assigned a real projectId/geographyUnitId instead
  // of null.
  const geographyResult = await seedGeographyUnits();
  const projectResult = await seedTestProject();
  results.push(geographyResult, projectResult);

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
