#!/usr/bin/env node
/**
 * One-off helper: derive a per-service .env (DATABASE_URL/DIRECT_URL with the
 * service's schema= namespace appended) from the root .env, without ever
 * printing the credential to stdout/the shell history. Mirrors the logic in
 * tools/prisma-foreach.js.
 *
 * Usage: node tools/write-service-env.js <service-name>
 */
const { chmodSync, existsSync, readFileSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const service = process.argv[2];
if (!service) {
  console.error('Usage: node tools/write-service-env.js <service-name>');
  process.exit(1);
}

function readEnvVar(file, key) {
  if (!existsSync(file)) return undefined;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(new RegExp(`^${key}=(.*)$`));
    if (m) return m[1].trim();
  }
  return undefined;
}

function withSchema(url, schema) {
  const cleaned = url.replace(/([?&])schema=[^&]*/g, '$1').replace(/[?&]$/, '');
  const sep = cleaned.includes('?') ? '&' : '?';
  return `${cleaned}${sep}schema=${schema}`;
}

const rootEnv = join(__dirname, '..', '.env');
const baseDb = readEnvVar(rootEnv, 'DATABASE_URL');
const baseDirect = readEnvVar(rootEnv, 'DIRECT_URL') || baseDb;

if (!baseDb) {
  console.error('Root .env has no DATABASE_URL.');
  process.exit(1);
}

const svcDir = join(__dirname, '..', 'apps', service);
const svcEnvExample = join(svcDir, '.env.example');
const svcUrl = readEnvVar(svcEnvExample, 'DATABASE_URL') || '';
const schema = (svcUrl.match(/schema=([^&]+)/) || [])[1];
if (!schema) {
  console.error(`Could not determine schema= for ${service} from ${svcEnvExample}`);
  process.exit(1);
}

const outPath = join(svcDir, '.env');
const contents = [
  `DATABASE_URL=${withSchema(baseDb, schema)}`,
  `DIRECT_URL=${withSchema(baseDirect, schema)}`,
  '',
].join('\n');

writeFileSync(outPath, contents, { mode: 0o600 });
// `mode` on writeFileSync only applies when the file is created; if outPath
// already existed, its prior permissions are left untouched. Since this file
// holds credentials, chmod explicitly so it's always 0600 either way.
chmodSync(outPath, 0o600);
console.log(`Wrote ${outPath} (schema=${schema}) — credential not printed.`);
