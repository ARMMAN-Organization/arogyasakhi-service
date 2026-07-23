#!/usr/bin/env node
/**
 * Runs `prisma/seed.ts` for every service that has one, using the root .env's
 * DATABASE_URL/DIRECT_URL (all services share the `public` schema — see
 * prisma-foreach.js). Each seed script is expected to be idempotent (skip
 * when its data already exists), so re-running this is always safe.
 *
 * Usage:
 *   node tools/prisma-seed-foreach.js          # seed every service that has prisma/seed.ts
 */
const { execFileSync } = require('node:child_process');
const { readdirSync, existsSync } = require('node:fs');
const { join } = require('node:path');

const appsDir = join(__dirname, '..', 'apps');

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
  const seedFile = join(appsDir, service, 'prisma', 'seed.ts');
  console.log(`\n— ${service} —`);
  try {
    execFileSync(
      'npx',
      ['ts-node', '--compiler-options', '{"module":"commonjs"}', seedFile],
      { stdio: 'inherit' },
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
