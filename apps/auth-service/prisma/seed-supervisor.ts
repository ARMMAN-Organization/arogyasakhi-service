import type { PrismaClient } from '../../../node_modules/.prisma/client-auth-service';

/**
 * Resolves a Supervisor's `users.id` from their username, so a SAKHI seed
 * entry's optional `supervisorUsername` can be turned into
 * `sakhi_profiles.supervisor_id`. Requires the SUPERVISOR env var to have
 * already been seeded in this run (see SEED_USER_ENV_VARS order in
 * seed-data.ts) — throws by name rather than silently leaving supervisorId
 * unset, per this repo's "fail fast on misconfigured env" standard.
 */
export async function resolveSupervisorId(
  prisma: Pick<PrismaClient, 'user'>,
  supervisorUsername: string,
): Promise<string> {
  const supervisor = await prisma.user.findUnique({ where: { username: supervisorUsername } });
  if (!supervisor) {
    throw new Error(
      `Supervisor username "${supervisorUsername}" not found — seed SUPERVISOR before SAKHI.`,
    );
  }
  return supervisor.id;
}
