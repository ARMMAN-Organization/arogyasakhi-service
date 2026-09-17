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
 *
 * Post-migrate hooks (two-phase migrations):
 *   A migration folder may include a `post-migrate.ts` file (e.g.
 *   apps/beneficiary-service/prisma/migrations/20260907000000_add_beneficiary_unique_id/
 *   post-migrate.ts) — for a migration that adds a column as nullable so a
 *   later migration can enforce NOT NULL only once every row has a value
 *   (see beneficiary-service's uniqueId field for the motivating case).
 *
 *   For `migrate deploy` only, this script detects any pending migration
 *   with a post-migrate.ts, and runs `prisma migrate deploy` in segments: up
 *   to and including the hook migration, then the hook script (via
 *   ts-node), then the remaining pending migrations. Every migration folder
 *   AFTER a hook point is temporarily moved aside (to a sibling
 *   `.prisma-foreach-pending/` directory) so Prisma's own `migrate deploy`
 *   — which always applies everything pending on disk, with no "stop after
 *   one migration" flag — cannot see or apply them until the hook has run.
 *   Folders are restored in a `finally` so a crash mid-run never leaves a
 *   migration permanently hidden from Prisma.
 *
 *   The hook script's own exit code gates the next segment: a non-zero
 *   exit (e.g. the uniqueId backfill leaving rows unresolved) stops before
 *   the next migration is even attempted, since applying a NOT NULL
 *   migration over still-incomplete data would just fail anyway.
 */
const { execFileSync } = require('node:child_process');
const { readdirSync, existsSync, readFileSync, renameSync, mkdirSync, rmdirSync } = require('node:fs');
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

/**
 * Migration folder names for a service, in the same chronological order
 * Prisma itself applies them (folder names are timestamp-prefixed, so a
 * plain sort matches Prisma's own ordering). Excludes migration_lock.toml
 * and any non-directory entry.
 */
function listMigrationDirs(migrationsDir) {
  if (!existsSync(migrationsDir)) return [];
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * Runs `prisma migrate deploy` for one service, pausing at each migration
 * that has a post-migrate.ts hook to run it before continuing — see this
 * file's header comment. Falls back to a single plain `migrate deploy` call
 * when the service has no hooks at all (the common case), so this adds no
 * extra prisma invocations for every other service.
 */
function migrateDeployWithHooks(service, schemaFile, migrationsDir, env) {
  const allMigrations = listMigrationDirs(migrationsDir);
  const hookMigrations = allMigrations.filter((name) =>
    existsSync(join(migrationsDir, name, 'post-migrate.ts')),
  );

  if (hookMigrations.length === 0) {
    execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaFile], {
      stdio: 'inherit',
      env,
    });
    return;
  }

  // Held OUTSIDE migrationsDir entirely (a sibling of prisma/), not just a
  // subdirectory of it — Prisma's schema engine scans every directory
  // directly under migrations/ as a candidate migration folder, so even an
  // empty `.prisma-foreach-pending/` living inside migrations/ itself was
  // enough to make `migrate deploy` fail looking for a migration.sql that
  // was never meant to be one (confirmed live).
  const pendingHoldDir = join(migrationsDir, '..', '.prisma-foreach-pending');
  // Migrations still hidden away from a previous run that crashed before
  // restoring them — put them back before this run touches anything, so a
  // retry doesn't compound on top of an already-broken hide/restore state.
  if (existsSync(pendingHoldDir)) {
    for (const name of readdirSync(pendingHoldDir)) {
      renameSync(join(pendingHoldDir, name), join(migrationsDir, name));
    }
    rmdirSync(pendingHoldDir);
  }

  let hiddenNames = [];
  try {
    for (const hookMigration of hookMigrations) {
      const hookIndex = allMigrations.indexOf(hookMigration);
      const laterMigrations = allMigrations.slice(hookIndex + 1);

      hiddenNames = laterMigrations.filter((name) => existsSync(join(migrationsDir, name)));
      if (hiddenNames.length > 0) {
        mkdirSync(pendingHoldDir, { recursive: true });
        for (const name of hiddenNames) {
          renameSync(join(migrationsDir, name), join(pendingHoldDir, name));
        }
      }

      console.log(
        `  → applying migrations up to and including "${hookMigration}" for ${service}…`,
      );
      execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaFile], {
        stdio: 'inherit',
        env,
      });

      if (hiddenNames.length > 0) {
        for (const name of hiddenNames) {
          renameSync(join(pendingHoldDir, name), join(migrationsDir, name));
        }
        rmdirSync(pendingHoldDir);
        hiddenNames = [];
      }

      const hookScript = join(migrationsDir, hookMigration, 'post-migrate.ts');
      console.log(`  → running post-migrate hook for "${hookMigration}"…`);
      execFileSync(
        'npx',
        ['ts-node', '-r', 'tsconfig-paths/register', hookScript],
        {
          stdio: 'inherit',
          env: { ...env, TS_NODE_PROJECT: join(join(migrationsDir, '..', '..'), 'tsconfig.app.json') },
        },
      );
    }

    // Every remaining migration after the last hook (or the whole set, if
    // somehow nothing was pending above) still needs to be applied.
    console.log(`  → applying remaining migrations for ${service}…`);
    execFileSync('npx', ['prisma', 'migrate', 'deploy', '--schema', schemaFile], {
      stdio: 'inherit',
      env,
    });
  } finally {
    // Restore anything still hidden (e.g. the hook script itself threw) so
    // a failed run never leaves migrations invisible to Prisma.
    if (hiddenNames.length > 0 && existsSync(pendingHoldDir)) {
      for (const name of hiddenNames) {
        const from = join(pendingHoldDir, name);
        if (existsSync(from)) renameSync(from, join(migrationsDir, name));
      }
      if (readdirSync(pendingHoldDir).length === 0) rmdirSync(pendingHoldDir);
    }
  }
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
const isMigrateDeploy = args[0] === 'migrate' && args[1] === 'deploy';
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
    if (isMigrateDeploy) {
      const migrationsDir = join(dir, 'prisma', 'migrations');
      migrateDeployWithHooks(service, schemaFile, migrationsDir, env);
    } else {
      execFileSync('npx', ['prisma', ...prismaArgs, '--schema', schemaFile], { stdio: 'inherit', env });
    }
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
