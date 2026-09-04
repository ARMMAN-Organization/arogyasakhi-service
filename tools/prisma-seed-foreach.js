#!/usr/bin/env node
/**
 * Runs `prisma/seed.ts` for every service that has one.
 *
 * Each service owns its own Postgres schema on the shared database (see
 * apps/<svc>/.env's DATABASE_URL `?schema=<name>` param), the same layout
 * prisma-foreach.js targets for `migrate`/`db push`. This script previously
 * ignored that per-service override and always seeded against the root
 * .env's DATABASE_URL/DIRECT_URL as-is — every service whose schema wasn't
 * whatever the root .env happened to point to failed with a P2021 "table
 * does not exist" error (e.g. cms-content-service's health_education_messages,
 * risk-referral-service's risk_conditions), even though the migration itself
 * had already run correctly in that service's own schema. Fixed to resolve
 * and apply each service's own schema override, mirroring
 * prisma-foreach.js's withSchema() exactly.
 *
 * Each seed script is expected to be idempotent (skip when its data already
 * exists), so re-running this is always safe.
 *
 * Usage:
 *   node tools/prisma-seed-foreach.js          # seed every service that has prisma/seed.ts
 */
const { execFileSync } = require('node:child_process');
const { readdirSync, existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

/** Read a KEY=value from a dotenv-style file, or undefined. */
function readEnvVar(file, key) {
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^${key}=(.*)$`));
    if (m) return m[1].trim();
  }
  return undefined;
}

/** Strip any existing ?schema=/&schema= and append schema=<name>. */
function withSchema(url, schema) {
  const cleaned = url.replace(/([?&])schema=[^&]*/g, '$1').replace(/[?&]$/, '');
  const sep = cleaned.includes('?') ? '&' : '?';
  return `${cleaned}${sep}schema=${schema}`;
}

const appsDir = join(__dirname, '..', 'apps');
const rootEnv = join(__dirname, '..', '.env');
const rootDatabaseUrl = readEnvVar(rootEnv, 'DATABASE_URL');
const rootDirectUrl = readEnvVar(rootEnv, 'DIRECT_URL') || rootDatabaseUrl;

const services = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => existsSync(join(appsDir, n, 'prisma', 'seed.ts')));

if (services.length === 0) {
  console.log('No prisma/seed.ts found under apps/*/prisma/ — nothing to do.');
  process.exit(0);
}

console.log(`Seeding ${services.length} service(s): ${services.join(', ')}`);
let failed = 0;
for (const service of services) {
  const dir = join(appsDir, service);
  const seedFile = join(dir, 'prisma', 'seed.ts');
  const env = { ...process.env };
  if (rootDatabaseUrl) env.DATABASE_URL = rootDatabaseUrl;
  if (rootDirectUrl) env.DIRECT_URL = rootDirectUrl;

  // Per-service schema namespace, from apps/<svc>/.env then .env.example —
  // same resolution order as prisma-foreach.js.
  const svcUrl =
    readEnvVar(join(dir, '.env'), 'DATABASE_URL') ||
    readEnvVar(join(dir, '.env.example'), 'DATABASE_URL') ||
    '';
  const schema = (svcUrl.match(/schema=([^&]+)/) || [])[1];
  if (schema && rootDatabaseUrl) {
    env.DATABASE_URL = withSchema(rootDatabaseUrl, schema);
    env.DIRECT_URL = withSchema(rootDirectUrl, schema);
  }

  console.log(`\n— ${service} —`);
  try {
    execFileSync(
      'npx',
      ['ts-node', '--compiler-options', '{"module":"commonjs","resolveJsonModule":true}', seedFile],
      { stdio: 'inherit', env },
    );
  } catch {
    console.error(`✗ ${service}: seed failed`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} service(s) failed to seed.`);
  process.exit(1);
}
console.log('\n✓ Seeded all services.');
