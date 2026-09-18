import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { COVERED_SERVICES, PERMISSIONS_MATRIX } from './permissions-matrix';

// libs/service-commons/src/auth -> repo root is 4 levels up.
const REPO_ROOT = join(__dirname, '..', '..', '..', '..');

/** One `requireRoles(...)` call site found in a service's route/controller source. */
interface CallSite {
  file: string;
  roles: string[];
}

function listTsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      out.push(...listTsFiles(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Blanks out block comments and line comments (length-preserving — each
 * stripped character becomes a space, so match indices into the result
 * still line up 1:1 with the original source) — good enough (not a real
 * tokenizer) to stop a requireRoles(...) mentioned only in a comment from
 * being counted as a real middleware call site.
 */
function blankComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (m) => ' '.repeat(m.length))
    .replace(/\/\/[^\n]*/g, (m) => ' '.repeat(m.length));
}

function findRequireRolesCallSites(serviceDir: string): CallSite[] {
  const sites: CallSite[] = [];
  for (const file of listTsFiles(serviceDir)) {
    const code = blankComments(readFileSync(file, 'utf8'));
    const regex = /requireRoles\(([^)]*)\)/g;
    let match: RegExpExecArray | null;
    while ((match = regex.exec(code))) {
      // Skips a `requireRoles(...)` mentioned inside a runtime string
      // literal (e.g. an OpenAPI `summary` describing the route's own
      // gating, as in "gated by requireRoles('SAKHI') since...") rather than
      // a real middleware call — a real call site is always the first
      // non-whitespace token on its line (it's a bare array entry in a
      // middleware chain); the string-embedded mentions in this codebase are
      // always preceded by other text ("gated by ") on the same line.
      const linePrefix = code.slice(code.lastIndexOf('\n', match.index) + 1, match.index);
      if (linePrefix.trim().length > 0) continue;

      const rolesArg = match[1];
      const roles = [...rolesArg.matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]);
      sites.push({ file: file.slice(REPO_ROOT.length + 1), roles });
    }
  }
  return sites;
}

describe('PERMISSIONS_MATRIX drift check', () => {
  it.each(COVERED_SERVICES)(
    "every requireRoles(...) call site in %s's routes has a matching, same-roles matrix row count",
    (service) => {
      const serviceDir = join(REPO_ROOT, 'apps', service, 'src');
      const callSites = findRequireRolesCallSites(serviceDir);
      const matrixRows = PERMISSIONS_MATRIX.filter((row) => row.service === service);

      // A route file may register `requireRoles(...)` behind a doc.get/post
      // wrapper the regex can't attribute to a specific path, so this checks
      // COUNTS and the exact multiset of role-sets, not path-by-path —
      // still enough to flag "someone added/removed/changed a
      // requireRoles(...) call and forgot the matrix."
      expect(callSites.length).toBe(matrixRows.length);

      const callSiteRoleSets = callSites.map((s) => [...s.roles].sort().join(',')).sort();
      const matrixRoleSets = matrixRows.map((r) => [...r.roles].sort().join(',')).sort();
      expect(callSiteRoleSets).toEqual(matrixRoleSets);
    },
  );

  it('has no duplicate (service, method, path) rows', () => {
    const seen = new Set<string>();
    for (const row of PERMISSIONS_MATRIX) {
      const key = `${row.service} ${row.method} ${row.path}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });
});
