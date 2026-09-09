#!/usr/bin/env node
/**
 * Runs a Prisma command against every service schema in apps/*\/prisma/schema.prisma
 * (or just one, via --service=<name> — see below).
 *
 * Each service owns its own isolated Prisma client (see the `output` in each
 * schema) AND, per apps/<svc>/.env's own `?schema=<name>` param, its own
 * dedicated Postgres schema (e.g. auth_service, audit_service, beneficiary)
 * — confirmed live and correct as of 2026-09-08. (An earlier version of this
 * comment claimed every service had been consolidated onto one shared
 * `public` schema — that was stale/inaccurate; do not rely on it.)
 *
 * THIS is the safe way to run Prisma in this repo. Do NOT run a bare
 * `npx prisma <cmd> --schema=apps/<svc>/prisma/schema.prisma` from the repo
 * root — dotenv resolves `.env` relative to `cwd`, so that invocation loads
 * the ROOT .env (no `schema=` param, defaults to `public`) instead of the
 * service's own apps/<svc>/.env, and Prisma silently reports status against
 * the wrong schema (a different, unrelated migration history — not real
 * data loss, but very misleading). This script fixes that by reading each
 * service's own `.env` for its schema name and rebuilding the connection
 * URL before invoking Prisma — see withSchema()/readEnvVar() below.
 *
 * Usage:
 *   node tools/prisma-foreach.js generate                       # generate all service clients
 *   node tools/prisma-foreach.js migrate status                 # status for all services
 *   node tools/prisma-foreach.js migrate status --service=audit-service   # just one service
 *   node tools/prisma-foreach.js db push --yes                  # push each schema (needs explicit --yes)
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

// --service=<name> restricts the run to one service instead of all of
// them — stripped before the remaining args are forwarded to Prisma, same
// as --yes/--force below.
const serviceFilterArg = args.find((a) => a.startsWith('--service='));
const serviceFilter = serviceFilterArg ? serviceFilterArg.slice('--service='.length) : undefined;

const allServices = readdirSync(appsDir, { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name)
  .filter((n) => existsSync(join(appsDir, n, 'prisma', 'schema.prisma')));

if (allServices.length === 0) {
  console.log('No Prisma schemas found under apps/*/prisma/ — nothing to do.');
  process.exit(0);
}

let services = allServices;
if (serviceFilter) {
  if (!allServices.includes(serviceFilter)) {
    console.error(
      `✗ --service=${serviceFilter} does not match any service with a Prisma schema. ` +
        `Known services: ${allServices.join(', ')}`,
    );
    process.exit(1);
  }
  services = [serviceFilter];
}

const rootEnv = join(__dirname, '..', '.env');
const baseDb = readEnvVar(rootEnv, 'DATABASE_URL');
const baseDirect = readEnvVar(rootEnv, 'DIRECT_URL') || baseDb;

const isDbPush = args[0] === 'db' && args[1] === 'push';
// `--yes`/`--force`/`--service=<name>` are wrapper-only flags (checked once,
// up front, above/below) — strip them before the args are forwarded to the
// real `prisma` CLI, which doesn't recognize any of them.
const wrapperConfirmed = args.includes('--yes') || args.includes('--force');
const prismaArgs = args.filter(
  (a) => a !== '--yes' && a !== '--force' && !a.startsWith('--service='),
);

if (isDbPush && !prismaArgs.includes('--accept-data-loss')) {
  // Every service has its own dedicated Postgres schema (see header
  // comment) — a `db push` for one service's schema does not touch another
  // service's tables. But all services share the same physical Postgres
  // instance/connection pool, and looping this over every schema in one
  // run still has real, repo-wide blast radius (many schemas changed in
  // one go, no per-service review step) — Prisma's own interactive safety
  // prompt would normally catch a destructive change, and appending
  // --accept-data-loss below silently forces that prompt off for every
  // schema in the loop. Require the caller to opt in explicitly on the
  // wrapper itself rather than defaulting to it.
  if (!wrapperConfirmed) {
    console.error(
      '✗ Refusing to run "db push" without an explicit --yes/--force on this ' +
        'wrapper. Even though each service has its own schema, this command loops ' +
        'over every schema in one run with no per-service review step. Re-run with ' +
        '"node tools/prisma-foreach.js db push --yes" (add --service=<name> to scope ' +
        'it to one service) once you have confirmed the change is safe to apply.',
    );
    process.exit(1);
  }
  console.warn(
    serviceFilter
      ? `⚠ Running "db push --accept-data-loss" for ${serviceFilter}'s own schema only.`
      : '⚠ Running "db push --accept-data-loss" across every service\'s schema in one run — ' +
          'each schema is isolated, but this changes all of them with no per-service review step.',
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
console.log(serviceFilter ? `\n✓ Done for ${serviceFilter}.` : '\n✓ Done for all services.');
