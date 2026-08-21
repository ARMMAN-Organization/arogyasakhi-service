import { PrismaClient } from '../../../node_modules/.prisma/client-closure-reopen-service';

const prisma = new PrismaClient();

// Read directly from process.env (not appConfig) — this script is run standalone via
// ts-node (see tools/prisma-seed-foreach.js) without the path-alias registration
// app code relies on to resolve `@armman/*` workspace packages, so this file (and
// everything it imports) must stay free of any `@armman/*` import, same reasoning as
// this service's own HTTP-only clients (e.g. src/reopen-requests/lookup.client.ts).
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

const DEMO_REOPEN_REQUEST_UUID = 'DEMO-QR-REOPEN-01';

/**
 * Resolves the APPROVAL_STATUS/PENDING lookup_values id via auth-service's
 * GET /lookups/APPROVAL_STATUS, through the gateway — mirrors this service's own
 * LookupClient.resolveApprovalStatusId (src/reopen-requests/lookup.client.ts), kept
 * local here rather than imported so this script never pulls in `@armman/service-commons`
 * (see note on API_GATEWAY_BASE_URL above). Returns null (never throws) on any failure
 * so the caller can skip gracefully instead of aborting the whole seed run.
 */
async function resolveApprovalStatusPendingId(authorizationHeader: string): Promise<string | null> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/APPROVAL_STATUS`, {
      headers: { Authorization: authorizationHeader },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: { values: { id: string; valueCode: string }[] } };
    return body.data.values.find((v) => v.valueCode === 'PENDING')?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Raises a Quick Response card by calling approval-service's POST /approvals through the
 * gateway — mirrors this service's own ApprovalClient.create() (src/reopen-requests/approval.client.ts),
 * kept local for the same reason as resolveApprovalStatusPendingId above. Returns whether
 * it succeeded (never throws) so a card-raise failure degrades to a log line, not a
 * crashed seed run — the reopen request row itself is this service's own source of truth
 * and stays committed either way.
 */
async function raiseApprovalRequest(
  input: {
    beneficiaryId: string;
    reopenRequestId: string;
    requestedByUserId: string;
    decisionStatusLookupId: string;
  },
  authorizationHeader: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/approvals`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: 'REOPEN',
        beneficiaryId: input.beneficiaryId,
        sourceEntityType: 'ReopenRequest',
        sourceEntityId: input.reopenRequestId,
        reopenRequestId: input.reopenRequestId,
        requestedByUserId: input.requestedByUserId,
        decisionStatusLookupId: input.decisionStatusLookupId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Demo REOPEN Quick Response card (SRS FR-SV-4.7 / FR-S-10.3). Creates a reopen_requests
 * row directly (supervisorStatus defaults to PENDING) and raises its linked
 * approval_requests row via approval-service's public POST /approvals — the same
 * end-to-end effect as ReopenRequestService.create(), which this script can't import
 * directly (it and its AuditClient/NotificationClient/ApprovalClient collaborators pull
 * in `@armman/service-commons`, unresolvable from a plain ts-node run — see the note on
 * API_GATEWAY_BASE_URL above).
 *
 * Needs a beneficiary and a Sakhi user that already exist (this repo has no seed data
 * for either) and a bearer token for a SAKHI/SUPERVISOR user to call the two endpoints
 * above — none of these three has a fixed/predictable value anywhere in this codebase,
 * so they're supplied via env vars instead of assumed.
 */
async function seedReopenRequestDemo(): Promise<SeedResult> {
  const step = 'reopen-request-demo';
  const beneficiaryId = process.env.SEED_DEMO_BENEFICIARY_ID;
  const requestedByUserId = process.env.SEED_DEMO_SAKHI_USER_ID;
  const authToken = process.env.SEED_DEMO_AUTH_TOKEN;

  if (!beneficiaryId || !requestedByUserId || !authToken) {
    return {
      step,
      created: false,
      message:
        'SEED_DEMO_BENEFICIARY_ID / SEED_DEMO_SAKHI_USER_ID / SEED_DEMO_AUTH_TOKEN not set — skipped.',
    };
  }

  try {
    const existing = await prisma.reopenRequest.findFirst({
      where: { localReopenRequestUuid: DEMO_REOPEN_REQUEST_UUID },
    });
    if (existing) {
      return { step, created: false, message: 'Demo reopen request already exists — skipped.' };
    }

    const created = await prisma.reopenRequest.create({
      data: {
        localReopenRequestUuid: DEMO_REOPEN_REQUEST_UUID,
        beneficiaryId,
        requestReason: 'MIGRATION_RETURNED',
        requestedByUserId,
        requestedAt: new Date(),
      },
    });

    const authorizationHeader = `Bearer ${authToken}`;
    const decisionStatusLookupId = await resolveApprovalStatusPendingId(authorizationHeader);
    if (!decisionStatusLookupId) {
      return {
        step,
        created: true,
        message: `Seeded reopen request ${created.id} but no PENDING APPROVAL_STATUS lookup value was found — Quick Response card not raised.`,
      };
    }

    const raised = await raiseApprovalRequest(
      { beneficiaryId, reopenRequestId: created.id, requestedByUserId, decisionStatusLookupId },
      authorizationHeader,
    );

    return {
      step,
      created: true,
      message: raised
        ? `Seeded reopen request ${created.id} and raised its REOPEN Quick Response card.`
        : `Seeded reopen request ${created.id} but raising its Quick Response card failed — check approval-service.`,
    };
  } catch (err) {
    return {
      step,
      created: false,
      message: `Failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

async function main(): Promise<void> {
  const results = [await seedReopenRequestDemo()];

  console.log('\nSeed summary:');
  for (const r of results) {
    console.log(`  [${r.created ? 'created' : 'skipped'}] ${r.step}: ${r.message}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
