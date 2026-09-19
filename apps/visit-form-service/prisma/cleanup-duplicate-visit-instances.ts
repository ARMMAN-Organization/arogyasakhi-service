/**
 * One-time cleanup for scheduleIds with more than one non-deleted
 * VisitInstance — must run BEFORE the
 * 20260919160000_add_visit_instance_schedule_unique migration in every
 * environment with existing data, since that migration's partial unique
 * index will fail to create if any duplicates remain.
 *
 * For each affected scheduleId, keeps the earliest row by createdAt and
 * soft-deletes (isDeleted = true, deletedAt = now) the rest. Idempotent: a
 * scheduleId with 0 or 1 non-deleted VisitInstance rows is left untouched,
 * so re-running after a partial run (or on an already-clean DB) is safe.
 *
 * Usage:
 *   npx ts-node apps/visit-form-service/prisma/cleanup-duplicate-visit-instances.ts --dry-run
 *   npx ts-node apps/visit-form-service/prisma/cleanup-duplicate-visit-instances.ts
 *
 * --dry-run reports what WOULD be soft-deleted without writing anything —
 * run this first and review the output before running for real, since this
 * touches production-shaped data.
 */
import { PrismaClient } from '../../../node_modules/.prisma/client-visit-form-service';

const prisma = new PrismaClient();
const DRY_RUN = process.argv.includes('--dry-run');

async function main(): Promise<void> {
  const duplicateScheduleIds = await prisma.visitInstance.groupBy({
    by: ['scheduleId'],
    where: { isDeleted: false },
    _count: { _all: true },
    having: { scheduleId: { _count: { gt: 1 } } },
  });

  if (duplicateScheduleIds.length === 0) {
    console.log('No duplicate scheduleIds found — nothing to clean up.');
    return;
  }

  console.log(`Found ${duplicateScheduleIds.length} scheduleId(s) with duplicate visit instances.`);

  let totalSoftDeleted = 0;
  for (const { scheduleId } of duplicateScheduleIds) {
    const rows = await prisma.visitInstance.findMany({
      where: { scheduleId, isDeleted: false },
      orderBy: { createdAt: 'asc' },
      select: { id: true, createdAt: true, localVisitUuid: true },
    });

    const [keep, ...discard] = rows;
    console.log(
      `scheduleId ${scheduleId}: keeping ${keep.id} (createdAt ${keep.createdAt.toISOString()}), ` +
        `soft-deleting ${discard.length} row(s): ${discard.map((d) => d.id).join(', ')}`,
    );

    if (!DRY_RUN) {
      await prisma.visitInstance.updateMany({
        where: { id: { in: discard.map((d) => d.id) } },
        data: { isDeleted: true, deletedAt: new Date() },
      });
    }
    totalSoftDeleted += discard.length;
  }

  console.log(
    DRY_RUN
      ? `Dry run complete — would soft-delete ${totalSoftDeleted} duplicate row(s).`
      : `Done — soft-deleted ${totalSoftDeleted} duplicate row(s).`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
