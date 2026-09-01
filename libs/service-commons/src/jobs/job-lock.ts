/** Prisma unique-constraint violation code — same convention used across every service. */
const PRISMA_UNIQUE_CONSTRAINT_CODE = 'P2002';

function isUniqueConstraintViolation(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: unknown }).code === PRISMA_UNIQUE_CONSTRAINT_CODE
  );
}

/** The Prisma delegate shape every service's own `JobRun` model must expose. */
export interface JobRunDelegate {
  jobRun: {
    updateMany(args: {
      where: { jobName: string; lockedUntil: { lt: Date } };
      data: { lockedUntil: Date; lastRunAt: Date };
    }): Promise<{ count: number }>;
    create(args: {
      data: { jobName: string; lockedUntil: Date; lastRunAt: Date };
    }): Promise<unknown>;
  };
}

/**
 * DB-backed advisory lock so a cron job scheduled in-process on every
 * replica of a service doesn't run concurrently on more than one — without
 * this, a service running N replicas would process the same overdue
 * visits/follow-ups N times per tick.
 *
 * `jobRun` has no lock/free state of its own — "free" is simply "lockedUntil
 * is in the past" (or the row doesn't exist yet). Acquiring means either
 * updating a past-due row to a new future `lockedUntil` (`updateMany`'s
 * matched-row count is the atomicity guard — 0 rows updated means someone
 * else already holds it or it isn't due yet) or, on the very first run for a
 * `jobName`, creating the row — racing that create against another replica
 * relies on the column's own unique constraint (P2002) to decide the loser.
 */
export async function acquireJobLock(
  prisma: JobRunDelegate,
  jobName: string,
  lockDurationMs: number,
): Promise<boolean> {
  const now = new Date();
  const lockedUntil = new Date(now.getTime() + lockDurationMs);

  const updated = await prisma.jobRun.updateMany({
    where: { jobName, lockedUntil: { lt: now } },
    data: { lockedUntil, lastRunAt: now },
  });
  if (updated.count > 0) return true;

  try {
    await prisma.jobRun.create({ data: { jobName, lockedUntil, lastRunAt: now } });
    return true;
  } catch (err) {
    if (isUniqueConstraintViolation(err)) return false;
    throw err;
  }
}
