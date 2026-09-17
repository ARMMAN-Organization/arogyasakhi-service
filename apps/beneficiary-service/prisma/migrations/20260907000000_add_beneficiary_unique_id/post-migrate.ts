/**
 * Post-migrate hook (see tools/prisma-foreach.js's header comment) — run
 * automatically by `npm run migrate` right after this migration (nullable
 * unique_id column + sequence) succeeds, and before
 * 20260907000100_enforce_beneficiary_unique_id_not_null is applied.
 *
 * Backfills every pre-existing beneficiary_cases row so the NOT NULL
 * migration that follows doesn't fail on rows this feature didn't exist for
 * yet. A non-zero exit here stops prisma-foreach.js before it even attempts
 * that next migration, since applying NOT NULL over still-incomplete data
 * would just fail anyway (see backfillUniqueId.ts for what "incomplete"
 * means — e.g. a beneficiary whose geography reference no longer resolves).
 *
 * Requires the same env vars as backfillUniqueId.ts itself
 * (AUTH_SERVICE_BASE_URL, BACKFILL_SERVICE_CLIENT_ID,
 * BACKFILL_SERVICE_CLIENT_SECRET) — these must be set on whatever shell
 * runs `npm run migrate`, same as any other migration needing DATABASE_URL.
 */
import { backfillUniqueId } from '../../scripts/backfillUniqueId';

backfillUniqueId()
  .then(({ failed }) => {
    if (failed > 0) {
      console.error(
        'post-migrate hook: backfill left unresolved rows — refusing to continue to the ' +
          'NOT NULL migration. Resolve the row(s) above (fix the stale reference, or decide ' +
          'to soft-delete/sentinel-assign it) then re-run `npm run migrate`.',
      );
      process.exitCode = 1;
    }
  })
  .catch((err) => {
    console.error('post-migrate hook failed:', err);
    process.exitCode = 1;
  });
