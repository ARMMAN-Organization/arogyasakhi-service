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
 *   node tools/prisma-foreach.js db push            # push each schema to its namespace
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

console.log(`Running "prisma ${args.join(' ')}" for ${services.length} service(s)…`);
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
    // db push needs --accept-data-loss to be non-interactive on a shared DB.
    if (args[0] === 'db' && args[1] === 'push' && !args.includes('--accept-data-loss')) {
      args.push('--accept-data-loss');
    }
  }

  try {
    execFileSync('npx', ['prisma', ...args, '--schema', schemaFile], { stdio: 'inherit', env });
  } catch {
    console.error(`✗ ${service}: prisma ${args.join(' ')} failed`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} service(s) failed.`);
  process.exit(1);
}
console.log('\n✓ Done for all services.');
