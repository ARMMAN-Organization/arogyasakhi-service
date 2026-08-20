/**
 * Corrective backfill for migration 20260819000000_add_risk_flag_grade_rank.
 *
 * That migration added `risk_flags.grade_rank` and set it to 0 (NORMAL) for
 * every pre-existing row, regardless of that row's true historic grade
 * (stored via `risk_grade_lookup_value_id`, owned by auth-service — no
 * cross-service join available at migration time). On any environment where
 * `risk_flags` already had real MILD/MODERATE/SEVERE rows before that
 * migration ran, this silently corrupted their grade_rank going forward,
 * producing a false "improved to NORMAL" wherever gradeRank is compared
 * across visits (findConsecutiveNoImprovementCount, and the Part 3
 * dashboard's progression/deterioration reports — see schema.prisma's own
 * comment on gradeRank). See PR #172 review.
 *
 * This script re-derives the true grade_rank for every existing risk_flags
 * row by resolving its riskGradeLookupValueId to a RISK_GRADE valueCode via
 * auth-service's `GET /lookups/RISK_GRADE` (NOT a cross-schema SQL join —
 * respects the forklift rule) and re-mapping via the same NORMAL=0..SEVERE=3
 * scale the rule packs use (see anc-risk.rulesJson.ts/infant-risk.rulesJson.ts's
 * GRADE_RANK constant). Safe to run more than once — it always recomputes
 * from the lookup id, never trusts the existing grade_rank value.
 *
 * No-op (nothing to correct) on any environment where risk_flags was empty
 * when the 20260819000000 migration ran — e.g. local as of this writing.
 * Run this BEFORE trusting gradeRank-based history on any environment where
 * risk_flags may have had real grades prior to 2026-08-19.
 *
 * Usage:
 *   npx ts-node prisma/backfill-grade-rank-from-lookup.ts
 *
 * Env:
 *   AUTH_SERVICE_BASE_URL  base URL of auth-service (e.g. via the gateway),
 *                          default http://localhost:3000
 *   AUTH_SERVICE_TOKEN     bearer token for the /lookups read (any role)
 */
import { PrismaClient } from '../../../node_modules/.prisma/client-risk-referral-service';

const AUTH_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_SERVICE_TOKEN;

// Mirrors anc-risk.rulesJson.ts / infant-risk.rulesJson.ts's own GRADE_RANK
// constant — the scale every rule pack computes gradeRank from originally.
const GRADE_RANK: Record<string, number> = { NORMAL: 0, MILD: 1, MODERATE: 2, SEVERE: 3 };

interface LookupValue {
  id: string;
  valueCode: string;
}

export interface BackfillSummary {
  checked: number;
  corrected: number;
  unresolved: number;
}

interface RiskFlagClient {
  riskFlag: {
    findMany: (args: {
      select: { id: true; riskGradeLookupValueId: true; gradeRank: true };
    }) => Promise<Array<{ id: string; riskGradeLookupValueId: string; gradeRank: number }>>;
    update: (args: { where: { id: string }; data: { gradeRank: number } }) => Promise<unknown>;
  };
}

/** Fetches RISK_GRADE lookup values from auth-service and returns an id -> rank map. */
export async function loadLookupIdToRankMap(): Promise<Map<string, number>> {
  if (!AUTH_TOKEN) {
    throw new Error('AUTH_SERVICE_TOKEN is required to resolve RISK_GRADE lookup values.');
  }

  const url = `${AUTH_BASE_URL}/api/v1/lookups/RISK_GRADE`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${AUTH_TOKEN}` } });
  if (!res.ok) {
    throw new Error(`Failed to load RISK_GRADE lookups from ${url}: HTTP ${res.status}`);
  }

  const body = (await res.json()) as { data?: { values?: LookupValue[] } };
  const values = body.data?.values ?? [];
  if (values.length === 0) {
    throw new Error('RISK_GRADE lookup category returned no values — is auth-service seeded?');
  }

  const idToRank = new Map<string, number>();
  for (const value of values) {
    const rank = GRADE_RANK[value.valueCode];
    // HIGH/CRITICAL (overallRiskCategory-only values, never a per-condition
    // grade) have no GRADE_RANK entry — skipped, not an error; no risk_flags
    // row can carry them as its own grade.
    if (rank !== undefined) idToRank.set(value.id, rank);
  }
  return idToRank;
}

/**
 * Re-derives and corrects grade_rank for every risk_flags row, given a
 * pre-resolved lookup-id -> rank map. Extracted from main() so the
 * correction logic itself (what gets read/updated, and how unresolved rows
 * are counted) can be unit-tested against a mocked Prisma client, without
 * needing a live auth-service call — see backfill-grade-rank-from-lookup.spec.ts.
 */
export async function correctGradeRanks(
  client: RiskFlagClient,
  idToRank: Map<string, number>,
): Promise<BackfillSummary> {
  const flags = await client.riskFlag.findMany({
    select: { id: true, riskGradeLookupValueId: true, gradeRank: true },
  });

  let corrected = 0;
  let unresolved = 0;
  for (const flag of flags) {
    const trueRank = idToRank.get(flag.riskGradeLookupValueId);
    if (trueRank === undefined) {
      unresolved += 1;
      console.error(
        `risk_flags row ${flag.id} has riskGradeLookupValueId ${flag.riskGradeLookupValueId}, ` +
          'which does not resolve to a known NORMAL/MILD/MODERATE/SEVERE grade — left unchanged.',
      );
      continue;
    }
    if (trueRank !== flag.gradeRank) {
      await client.riskFlag.update({ where: { id: flag.id }, data: { gradeRank: trueRank } });
      corrected += 1;
    }
  }

  return { checked: flags.length, corrected, unresolved };
}

async function main(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    const idToRank = await loadLookupIdToRankMap();
    const summary = await correctGradeRanks(prisma, idToRank);

    console.log(
      `Checked ${summary.checked} risk_flags row(s): corrected ${summary.corrected}, ` +
        `already correct ${summary.checked - summary.corrected - summary.unresolved}, ` +
        `unresolved ${summary.unresolved}.`,
    );
    if (summary.unresolved > 0) {
      throw new Error(
        `${summary.unresolved} risk_flags row(s) could not be resolved to a known grade — see errors above.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
