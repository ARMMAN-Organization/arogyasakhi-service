import * as argon2 from 'argon2';
import { z } from 'zod';
import { ROLES } from '../../prisma/seed-data';
import type { PrismaClient } from '../../../../node_modules/.prisma/client-auth-service';

/**
 * Accepts any Prisma client shape (the app's PrismaService, or a plain
 * PrismaClient as used by the standalone prisma/seed.ts script) — this
 * module only calls model methods ($transaction, role.*, user.*, etc.),
 * never PrismaService's connect()/disconnect() lifecycle helpers, so callers
 * shouldn't be forced into that specific subclass.
 */
type SeedPrismaClient = PrismaClient;

/** Result of one startup-seed step, logged by `seedOnStartup`. */
export interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

/**
 * Seeds role master data (SAKHI/SUPERVISOR/MANAGER/ADMIN) only when the
 * `roles` table is empty (e.g. first boot on a fresh DB). Once roles exist,
 * they're left untouched so runtime edits are never reverted by a later
 * deploy/restart.
 */
export async function seedRoles(prisma: SeedPrismaClient): Promise<SeedResult> {
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

const seedAdminUserSchema = z.object({
  username: z.string().min(1),
  password: z.string().min(1),
  displayName: z.string().min(1),
});

/**
 * Parses the ADMIN env var (a JSON array of `{ username, password,
 * displayName }`). Throws with the var name on malformed JSON or a shape
 * mismatch — a typo in deployment config must fail startup loudly, per this
 * repo's "fail fast, never start misconfigured" standard, rather than
 * silently skip seeding the platform's first administrator.
 */
function parseAdminEnv(): z.infer<typeof seedAdminUserSchema>[] {
  const raw = process.env.ADMIN;
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('ADMIN must be valid JSON (an array of {username, password, displayName}).');
  }

  const result = z.array(seedAdminUserSchema).safeParse(parsed);
  if (!result.success) {
    throw new Error(`ADMIN is malformed: ${result.error.message}`);
  }
  return result.data;
}

/**
 * Finds the next free `+91900000<4-digit>` slot starting at `startIndex + 1`
 * within the ADMIN band (offset 300), skipping any number already taken by a
 * pre-existing row. Bounded to 1000 attempts (one full band) — running out
 * should surface as an error, not silently spill into another role's band.
 */
async function nextFreeAdminMobileNumber(
  prisma: SeedPrismaClient,
  startIndex: number,
): Promise<string> {
  const ADMIN_MOBILE_OFFSET = 300;
  for (let i = startIndex; i < startIndex + 1000; i++) {
    const candidate = `+91900000${String(ADMIN_MOBILE_OFFSET + i + 1).padStart(4, '0')}`;
    const existing = await prisma.user.findUnique({ where: { mobileNumber: candidate } });
    if (!existing) return candidate;
  }
  throw new Error('No free mobile number slot found for ADMIN.');
}

/**
 * Seeds ADMIN user(s) from the `ADMIN` env var (a JSON array, so more than
 * one administrator can be provisioned). Runs in every environment,
 * including production — this is how the platform gets its first
 * administrator. A user already existing by username is left untouched
 * (never re-created, password never rotated). mobileNumber is not part of
 * the env payload (login is username + password only per the SRS) — it's
 * derived by probing the DB for the next free slot, since other ad hoc
 * users may already occupy earlier numbers.
 */
export async function seedAdminUsers(prisma: SeedPrismaClient): Promise<SeedResult[]> {
  const admins = parseAdminEnv();
  if (admins.length === 0) {
    return [
      { step: 'seedUser:ADMIN', created: false, message: 'ADMIN not set or empty — skipped.' },
    ];
  }

  const role = await prisma.role.findUniqueOrThrow({ where: { roleCode: 'ADMIN' } });
  const results: SeedResult[] = [];

  for (const [index, admin] of admins.entries()) {
    const existing = await prisma.user.findUnique({ where: { username: admin.username } });
    if (existing) {
      results.push({
        step: `seedUser:${admin.username}`,
        created: false,
        message: `User ${admin.username} already exists — skipped.`,
      });
      continue;
    }

    const passwordHash = await argon2.hash(admin.password);
    const mobileNumber = await nextFreeAdminMobileNumber(prisma, index);

    await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          username: admin.username,
          mobileNumber,
          passwordHash,
          displayName: admin.displayName,
          status: 'ACTIVE',
        },
      });
      await tx.userRole.create({
        data: {
          userId: created.id,
          roleId: role.id,
          effectiveFrom: new Date(),
          status: 'ACTIVE',
        },
      });
    });

    results.push({
      step: `seedUser:${admin.username}`,
      created: true,
      message: `Seeded ADMIN user ${admin.username} (mobile ${mobileNumber}).`,
    });
  }

  return results;
}

/**
 * Runs at app boot (before the HTTP server starts listening): ensures role
 * master data and the platform's ADMIN user(s) exist, self-healing a fresh
 * deployment without a separate manual seed step. SAKHI/SUPERVISOR/MANAGER
 * test users are NOT seeded here — they stay behind the manual
 * `npm run prisma:seed` script (prisma/seed.ts), since they're dev/test
 * fixtures, not master data the app needs to function.
 */
export async function seedOnStartup(prisma: SeedPrismaClient): Promise<void> {
  const results = [await seedRoles(prisma), ...(await seedAdminUsers(prisma))];

  for (const r of results) {
    console.log(`[startup-seed] [${r.created ? 'created' : 'skipped'}] ${r.step}: ${r.message}`);
  }
}
