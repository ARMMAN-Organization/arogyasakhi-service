/**
 * Standalone CLI entrypoint for the SRS "Unique ID" backfill — see
 * backfillUniqueId.ts for the actual logic and required env vars. This
 * runs automatically as part of `npm run migrate` (see the post-migrate
 * hook at ../migrations/20260907000000_add_beneficiary_unique_id/post-migrate.ts
 * and tools/prisma-foreach.js) — this file exists only for a manual,
 * on-demand re-run (e.g. re-processing a row that failed the first time).
 *
 * Usage: npx ts-node -r tsconfig-paths/register apps/beneficiary-service/prisma/scripts/backfill-unique-id.ts
 */
import { backfillUniqueId } from './backfillUniqueId';

backfillUniqueId()
  .then(({ failed }) => {
    if (failed > 0) process.exitCode = 1;
  })
  .catch((err) => {
    console.error('Backfill script failed:', err);
    process.exitCode = 1;
  });
