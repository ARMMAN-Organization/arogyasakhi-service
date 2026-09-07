/**
 * One-off backfill for the SRS "Unique ID" field (State(2)-District(3)-
 * Block(3)-ID(6), see beneficiary.unique-id.ts). Run this AFTER migration
 * 20260907000000_add_beneficiary_unique_id (nullable column + sequence) and
 * BEFORE migration 20260907000100_enforce_beneficiary_unique_id_not_null
 * (which requires every row to already have a value).
 *
 * Assigns unique_id to every pre-existing beneficiary_cases row that lacks
 * one, in createdAt order (oldest first), so the assigned sequence values
 * roughly track enrollment history. Resolves geography via the same
 * `resolveGeographyCodesForBlock` client the live create() path uses — this
 * script authenticates as a service account (POST /auth/service-token) since
 * there is no human caller's bearer token to forward.
 *
 * Usage: npx ts-node apps/beneficiary-service/prisma/scripts/backfill-unique-id.ts
 * Required env: AUTH_SERVICE_BASE_URL, BACKFILL_SERVICE_CLIENT_ID,
 * BACKFILL_SERVICE_CLIENT_SECRET (a service account with permission to read
 * geography-units — see apps/auth-service's service-token flow).
 */
import { PrismaClient } from '../../../../node_modules/.prisma/client-beneficiary-service';
import { resolveGeographyCodesForBlock } from '../../src/geography/geography.client';
import { generateUniqueId } from '../../src/beneficiary/beneficiary.unique-id';

const AUTH_SERVICE_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

async function mintServiceToken(): Promise<string> {
  const clientId = process.env.BACKFILL_SERVICE_CLIENT_ID;
  const clientSecret = process.env.BACKFILL_SERVICE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error(
      'BACKFILL_SERVICE_CLIENT_ID and BACKFILL_SERVICE_CLIENT_SECRET must be set to run this script.',
    );
  }

  const res = await fetch(`${AUTH_SERVICE_BASE_URL}/api/v1/auth/service-token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clientId, clientSecret }),
  });
  if (!res.ok) {
    throw new Error(`Failed to mint a service token: HTTP ${res.status}`);
  }
  const body = (await res.json()) as { data: { accessToken: string } };
  return body.data.accessToken;
}

async function main() {
  const prisma = new PrismaClient();
  const authorizationHeader = `Bearer ${await mintServiceToken()}`;

  // Cache resolved codes per healthBlockId — most rows in one program share
  // a handful of blocks, so this avoids re-resolving the same chain per row.
  const codeCache = new Map<
    string,
    { stateCode: string; districtCode: string; blockCode: string }
  >();

  let processed = 0;
  let failed = 0;

  try {
    // `uniqueId: null` is not expressible via the generated Prisma types —
    // schema.prisma declares the column NOT NULL (the post-backfill target
    // state), but at the point this script runs, migration 20260907000000
    // has only added it as nullable. Raw SQL sidesteps that type/runtime
    // mismatch for this one query.
    const rows = await prisma.$queryRaw<{ id: string; healthBlockId: string | null }[]>`
      SELECT bc.beneficiary_id AS id, bp.health_block_id AS "healthBlockId"
      FROM beneficiary_cases bc
      JOIN beneficiary_pii bp ON bp.pii_id = bc.pii_id
      WHERE bc.unique_id IS NULL
      ORDER BY bc.created_at ASC
    `;

    console.log(`Found ${rows.length} beneficiary_cases row(s) needing a unique_id.`);

    for (const row of rows) {
      const healthBlockId = row.healthBlockId;
      if (!healthBlockId) {
        console.error(
          `Skipping beneficiary ${row.id}: no pii.healthBlockId on record — cannot resolve geography codes.`,
        );
        failed += 1;
        continue;
      }

      try {
        let codes = codeCache.get(healthBlockId);
        if (!codes) {
          codes = await resolveGeographyCodesForBlock(healthBlockId, authorizationHeader);
          codeCache.set(healthBlockId, codes);
        }

        const [{ nextval: sequence }] = await prisma.$queryRaw<
          { nextval: bigint }[]
        >`SELECT nextval('beneficiary_unique_id_seq')`;
        const uniqueId = generateUniqueId(codes, sequence);

        await prisma.beneficiaryCase.update({ where: { id: row.id }, data: { uniqueId } });
        processed += 1;
      } catch (err) {
        console.error(`Failed to backfill beneficiary ${row.id}:`, err);
        failed += 1;
      }
    }

    console.log(`Backfill complete: ${processed} updated, ${failed} failed.`);
    if (failed > 0) {
      console.error(
        `${failed} row(s) still lack a unique_id — resolve the errors above before running ` +
          'the NOT NULL migration, or that migration will fail.',
      );
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('Backfill script failed:', err);
  process.exitCode = 1;
});
