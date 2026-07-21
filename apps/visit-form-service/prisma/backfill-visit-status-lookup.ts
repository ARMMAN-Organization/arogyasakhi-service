/**
 * Backfill for the visit-status enum → lookup migration (20260720140000).
 *
 * The migration preserved each legacy row's old enum value in a nullable
 * `*_status_code` column and left `*_lookup_value_id` NULL. This script
 * resolves every distinct status_code to its VISIT_STATUS lookup_value_id and
 * populates the id columns, so a later migration can enforce NOT NULL on them.
 *
 * value_code → lookup_value_id is resolved by calling auth-service's
 * `GET /lookups/VISIT_STATUS` over HTTP — NOT a cross-schema SQL join — so the
 * backfill respects the forklift rule and keeps working if visit-form-service
 * and auth-service are ever split into separate databases. Idempotent: it only
 * touches rows where status_code IS NOT NULL AND *_lookup_value_id IS NULL, so
 * re-running after a partial run (or on a DB with no legacy rows) is safe.
 *
 * Env:
 *   AUTH_SERVICE_BASE_URL  base URL of auth-service (e.g. via the gateway),
 *                          default http://localhost:3000
 *   AUTH_SERVICE_TOKEN     bearer token for the /lookups read (any role)
 */
import { PrismaClient } from '../../../node_modules/.prisma/client-visit-form-service';

const prisma = new PrismaClient();

const AUTH_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_SERVICE_TOKEN;

interface LookupValue {
  id: string;
  valueCode: string;
}

/** Fetches VISIT_STATUS lookup values from auth-service and returns a value_code → id map. */
async function loadStatusCodeToIdMap(): Promise<Map<string, string>> {
  if (!AUTH_TOKEN) {
    throw new Error('AUTH_SERVICE_TOKEN is required to resolve VISIT_STATUS lookup values.');
  }

  const url = `${AUTH_BASE_URL}/api/v1/lookups/VISIT_STATUS`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } });
  if (!res.ok) {
    throw new Error(`Failed to load VISIT_STATUS lookups from ${url}: HTTP ${res.status}`);
  }

  const body = (await res.json()) as { data?: { values?: LookupValue[] } };
  const values = body.data?.values ?? [];
  if (values.length === 0) {
    throw new Error('VISIT_STATUS lookup category returned no values — is auth-service seeded?');
  }

  return new Map(values.map((v) => [v.valueCode, v.id]));
}

async function main(): Promise<void> {
  const codeToId = await loadStatusCodeToIdMap();
  const summary: Record<string, number> = {};

  // visit_instances.status_lookup_value_id
  for (const [code, id] of codeToId) {
    const result = await prisma.visitInstance.updateMany({
      where: { statusCode: code, statusLookupValueId: null },
      data: { statusLookupValueId: id },
    });
    if (result.count > 0) summary[`visit_instances:${code}`] = result.count;
  }

  // visit_status_history.from_status_lookup_value_id / to_status_lookup_value_id
  for (const [code, id] of codeToId) {
    const fromResult = await prisma.visitStatusHistory.updateMany({
      where: { fromStatusCode: code, fromStatusLookupValueId: null },
      data: { fromStatusLookupValueId: id },
    });
    if (fromResult.count > 0) summary[`visit_status_history.from:${code}`] = fromResult.count;

    const toResult = await prisma.visitStatusHistory.updateMany({
      where: { toStatusCode: code, toStatusLookupValueId: null },
      data: { toStatusLookupValueId: id },
    });
    if (toResult.count > 0) summary[`visit_status_history.to:${code}`] = toResult.count;
  }

  // Surface any codes that couldn't be resolved (a code with no matching
  // VISIT_STATUS lookup row would be left NULL and block the later NOT NULL
  // migration — better to fail loudly than silently skip).
  const unresolved = await prisma.visitInstance.count({
    where: { statusCode: { not: null }, statusLookupValueId: null },
  });

  console.log('Backfill summary:', Object.keys(summary).length ? summary : 'nothing to backfill');
  if (unresolved > 0) {
    throw new Error(
      `${unresolved} visit_instances row(s) have a status_code with no matching VISIT_STATUS lookup value — resolve before enforcing NOT NULL.`,
    );
  }
  console.log('Done — all rows with a status_code now have a status_lookup_value_id.');
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
