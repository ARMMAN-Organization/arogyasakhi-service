#!/usr/bin/env node
/**
 * Runs a Prisma command against every service schema in apps/*\/prisma/schema.prisma.
 *
 * Each service owns its own isolated Prisma client (see the `output` in each
 * schema). All services now share a single Postgres schema (`public`) —
 * per-service table names stay unique via `@@map(...)`, so there's no
 * namespace collision even without a dedicated schema per service. Per-service
 * schema targeting was dropped after Supabase's pgbouncer transaction pooler
 * proved unable to honor per-session `search_path`, which silently misrouted
 * migrations to the wrong schema.
 *
 * For `db push`/`db pull`/`migrate`, this script still supports an optional
 * per-service `schema=` override (read from apps/<svc>/.env or .env.example)
 * for anyone who reintroduces one — if none is set, it just uses the root
 * .env's DATABASE_URL/DIRECT_URL as-is (i.e. `public`).
 * For `generate` (no DB needed), it just runs per schema.
 *
 * Usage:
 *   node tools/prisma-foreach.js generate          # generate all service clients
 *   node tools/prisma-foreach.js db push --yes      # push each schema (needs explicit --yes)
 */
const { execFileSync } = require('node:child_process');
const { readdirSync, existsSync, readFileSync } = require('node:fs');
const { join } = require('node:path');

const appsDir = join(__dirname, '..', 'apps');
const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node tools/prisma-foreach.js <prisma-args...>  (e.g. "generate" or "db push")');
  process.exit(1);
}

const needsDb = args[0] === 'db' || args[0] === 'migrate';

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

const services = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => existsSync(join(appsDir, n, 'prisma', 'schema.prisma')));

if (services.length === 0) {
  console.log('No Prisma schemas found under apps/*/prisma/ — nothing to do.');
  process.exit(0);
}

const rootEnv = join(__dirname, '..', '.env');
const baseDb = readEnvVar(rootEnv, 'DATABASE_URL');
const baseDirect = readEnvVar(rootEnv, 'DIRECT_URL') || baseDb;

const isDbPush = args[0] === 'db' && args[1] === 'push';
// `--yes`/`--force` are wrapper-only opt-in flags (checked once, up front,
// below) — strip them before the args are forwarded to the real `prisma`
// CLI, which doesn't recognize either one.
const wrapperConfirmed = args.includes('--yes') || args.includes('--force');
const prismaArgs = args.filter((a) => a !== '--yes' && a !== '--force');

if (isDbPush && !prismaArgs.includes('--accept-data-loss')) {
  // Every service now shares one physical Postgres database (see header
  // comment), so a `db push` run through this script has platform-wide
  // blast radius — Prisma's own interactive safety prompt would normally
  // catch a destructive change, and appending --accept-data-loss below
  // silently forces that prompt off. Require the caller to opt in
  // explicitly on the wrapper itself rather than defaulting to it.
  if (!wrapperConfirmed) {
    console.error(
      '✗ Refusing to run "db push" without an explicit --yes/--force on this ' +
        'wrapper. Every service now shares one physical database, so this command ' +
        'has platform-wide blast radius. Re-run with ' +
        '"node tools/prisma-foreach.js db push --yes" once you have confirmed the ' +
        'change is safe to apply to every service.',
    );
    process.exit(1);
  }
  console.warn(
    '⚠ Running "db push --accept-data-loss" against the shared public schema — ' +
      'this affects every service in the database, not just the one being pushed.',
  );
  prismaArgs.push('--accept-data-loss');
}

console.log(`Running "prisma ${prismaArgs.join(' ')}" for ${services.length} service(s)…`);
let failed = 0;
for (const service of services) {
  const dir = join(appsDir, service);
  const schemaFile = join(dir, 'prisma', 'schema.prisma');
  const env = { ...process.env };

  if (needsDb) {
    // Per-service schema namespace, from apps/<svc>/.env then .env.example.
    const svcUrl =
      readEnvVar(join(dir, '.env'), 'DATABASE_URL') ||
      readEnvVar(join(dir, '.env.example'), 'DATABASE_URL') ||
      '';
    const schema = (svcUrl.match(/schema=([^&]+)/) || [])[1];
    if (schema && baseDb) {
      env.DATABASE_URL = withSchema(baseDb, schema);
      env.DIRECT_URL = withSchema(baseDirect, schema);
    }
  }

  try {
    execFileSync('npx', ['prisma', ...prismaArgs, '--schema', schemaFile], { stdio: 'inherit', env });
  } catch {
    console.error(`✗ ${service}: prisma ${prismaArgs.join(' ')} failed`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} service(s) failed.`);
  process.exit(1);
}
console.log('\n✓ Done for all services.');
