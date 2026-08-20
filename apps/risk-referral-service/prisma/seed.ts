import { PrismaClient } from '../../../node_modules/.prisma/client-risk-referral-service';
import selfReportedConditions from './seed-data/self-reported-conditions.json';
import riskParameters from './seed-data/risk-parameters.json';
import ancRiskConditions from './seed-data/anc-risk-conditions.json';
import infantRiskConditions from './seed-data/infant-risk-conditions.json';

const prisma = new PrismaClient();

// Read directly from process.env (not appConfig) — this script is run standalone via
// ts-node (see tools/prisma-seed-foreach.js) without the path-alias registration app
// code relies on to resolve `@armman/*` workspace packages, so this file (and
// everything it imports) must stay free of any `@armman/*` import — this is also why
// resolveReferralTypeLookupId/resolveApprovalStatusPendingId below are defined locally
// rather than imported from src/referrals/lookup.client.ts (which imports
// `@armman/service-commons`), even though the logic mirrors it exactly.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

/**
 * Resolves a REFERRAL_TYPE valueCode (STANDARD/ACCOMPANIED) to its lookup_values id via
 * auth-service's GET /lookups/REFERRAL_TYPE, through the gateway. Mirrors
 * src/referrals/lookup.client.ts's resolveReferralTypeLookupId — duplicated locally
 * rather than imported, see the note on API_GATEWAY_BASE_URL above. Returns null (never
 * throws) on any failure so the caller can skip gracefully instead of aborting the whole
 * seed run.
 */
async function resolveReferralTypeLookupId(
  valueCode: 'STANDARD' | 'ACCOMPANIED',
  authorizationHeader: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/lookups/REFERRAL_TYPE`, {
      headers: { Authorization: authorizationHeader },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data: { values: { id: string; valueCode: string }[] } };
    return body.data.values.find((v) => v.valueCode === valueCode)?.id ?? null;
  } catch {
    return null;
  }
}

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

interface SelfReportedConditionSeed {
  conditionCode: string;
  conditionName: string;
}

interface RiskParameterSeed {
  parameterCode: string;
  parameterName: string;
  entityType: 'MOTHER' | 'CHILD';
  unit: string | null;
  dataType: 'NUMERIC' | 'BOOLEAN' | 'CATEGORICAL';
}

interface AncRiskConditionSeed {
  conditionCode: string;
  conditionName: string;
  gradeScale: 'BINARY' | 'NORMAL_MILD_MODERATE_SEVERE' | 'NORMAL_LOW_MEDIUM_HIGH';
  // Reference/display-only — see schema.prisma's RiskCondition doc comment.
  // NOT read by anc-risk.rulesJson.ts / infant-risk.rulesJson.ts; editing
  // these values here does not change grading/trigger behavior.
  referralRequiredDefault: boolean;
  educationRequiredDefault: boolean;
}

/**
 * Master data for the self-reported medical conditions and sickle cell
 * statuses captured at enrollment (MOTHER_REGISTRATION Q58/Q60) — these have
 * no grading rule set (gradeScale BINARY, referral/education defaults false)
 * since they're history reported by the mother, not an evaluated risk.
 * Content lives in ./seed-data/self-reported-conditions.json, transcribed
 * from the MOTHER_REGISTRATION form's Q58/Q60 positive answer codes (see
 * apps/visit-form-service/prisma/seed-data/mother-registration.json).
 */
async function seedSelfReportedConditions(): Promise<SeedResult> {
  let createdCount = 0;

  for (const condition of selfReportedConditions as SelfReportedConditionSeed[]) {
    const existing = await prisma.riskCondition.findUnique({
      where: { conditionCode: condition.conditionCode },
    });
    if (existing) continue;

    await prisma.riskCondition.create({
      data: {
        conditionCode: condition.conditionCode,
        conditionName: condition.conditionName,
        entityType: 'MOTHER',
        phase: 'REGISTRATION',
        gradeScale: 'BINARY',
        referralRequiredDefault: false,
        educationRequiredDefault: false,
        status: 'ACTIVE',
      },
    });
    createdCount += 1;
  }

  if (createdCount === 0) {
    return {
      step: 'self-reported-conditions',
      created: false,
      message: 'All self-reported condition rows already present — skipped.',
    };
  }
  return {
    step: 'self-reported-conditions',
    created: true,
    message: `Seeded ${createdCount} self-reported condition row(s).`,
  };
}

/**
 * Master data for the raw measurable clinical parameters (e.g. systolic BP,
 * hemoglobin) that feed a rules-service rule evaluation — distinct from
 * RiskCondition, which is the resulting diagnosed/flagged condition after
 * grading. Content lives in ./seed-data/risk-parameters.json, based on the
 * observedValueJson keys referenced in apps/rules-service (e.g. systolicBp,
 * hemoglobin — see ruleVersion.routes.ts) and the corresponding question
 * codes in apps/visit-form-service/prisma/seed-data (anc-visit.json,
 * postpartum-visit.json, infant-visit.json).
 */
async function seedRiskParameters(): Promise<SeedResult> {
  let createdCount = 0;

  for (const parameter of riskParameters as RiskParameterSeed[]) {
    const existing = await prisma.riskParameter.findUnique({
      where: { parameterCode: parameter.parameterCode },
    });
    if (existing) continue;

    await prisma.riskParameter.create({
      data: {
        parameterCode: parameter.parameterCode,
        parameterName: parameter.parameterName,
        entityType: parameter.entityType,
        unit: parameter.unit,
        dataType: parameter.dataType,
        status: 'ACTIVE',
      },
    });
    createdCount += 1;
  }

  if (createdCount === 0) {
    return {
      step: 'risk-parameters',
      created: false,
      message: 'All risk parameter rows already present — skipped.',
    };
  }
  return {
    step: 'risk-parameters',
    created: true,
    message: `Seeded ${createdCount} risk parameter row(s).`,
  };
}

const DEMO_ACCOMPANIED_REFERRAL_TAG = 'DEMO-QR-ACCOMPANIED-REFERRAL';
const DEMO_REFERRAL_INCOMPLETE_TAG = 'DEMO-QR-REFERRAL-INCOMPLETE';

interface RaiseApprovalRequestInput {
  requestType: 'ACCOMPANIED_REFERRAL' | 'REFERRAL_INCOMPLETE';
  beneficiaryId: string;
  referralId: string;
  requestedByUserId: string;
  decisionStatusLookupId: string;
}

/**
 * Resolves the APPROVAL_STATUS/PENDING lookup_values id via auth-service's
 * GET /lookups/APPROVAL_STATUS, through the gateway — mirrors closure-reopen-service's
 * LookupClient.resolveApprovalStatusId. Kept local to this seed script (not src/) since
 * raising a Quick Response card from a referral is a seed-only convenience — unlike
 * ReopenRequestService, nothing in this service's real application code raises an
 * approval_requests row for a referral today. Returns null (never throws) on any
 * failure so the caller can skip gracefully instead of aborting the whole seed run.
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
 * gateway — mirrors closure-reopen-service's ApprovalClient.create(). Kept local for the
 * same reason as resolveApprovalStatusPendingId above. Returns whether it succeeded
 * (never throws) so a card-raise failure degrades to a log line, not a crashed seed run —
 * the referral row itself is this service's own source of truth and stays committed
 * either way.
 */
async function raiseApprovalRequest(
  input: RaiseApprovalRequestInput,
  authorizationHeader: string,
): Promise<boolean> {
  try {
    const res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/approvals`, {
      method: 'POST',
      headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requestType: input.requestType,
        beneficiaryId: input.beneficiaryId,
        sourceEntityType: 'Referral',
        sourceEntityId: input.referralId,
        referralId: input.referralId,
        requestedByUserId: input.requestedByUserId,
        decisionStatusLookupId: input.decisionStatusLookupId,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/** Common env-var + demo-row-exists guard shared by both referral-backed demo seeds below. */
async function checkReferralDemoPreconditions(
  tag: string,
): Promise<
  | { proceed: false; result: SeedResult }
  | { proceed: true; beneficiaryId: string; requestedByUserId: string; authorizationHeader: string }
> {
  const beneficiaryId = process.env.SEED_DEMO_BENEFICIARY_ID;
  const requestedByUserId = process.env.SEED_DEMO_SAKHI_USER_ID;
  const authToken = process.env.SEED_DEMO_AUTH_TOKEN;
  if (!beneficiaryId || !requestedByUserId || !authToken) {
    return {
      proceed: false,
      result: {
        step: tag,
        created: false,
        message:
          'SEED_DEMO_BENEFICIARY_ID / SEED_DEMO_SAKHI_USER_ID / SEED_DEMO_AUTH_TOKEN not set — skipped.',
      },
    };
  }

  const existing = await prisma.referral.findFirst({ where: { facilityName: tag } });
  if (existing) {
    return {
      proceed: false,
      result: { step: tag, created: false, message: 'Demo referral already exists — skipped.' },
    };
  }

  return {
    proceed: true,
    beneficiaryId,
    requestedByUserId,
    authorizationHeader: `Bearer ${authToken}`,
  };
}

/**
 * Shared by seedAncRiskConditions/seedInfantRiskConditions below — both
 * differ only in the imported JSON, entityType, phase, and step name; every
 * other line (existence check, create() shape, result branches) was
 * previously copy-pasted verbatim between them (see PR #172 review).
 */
async function seedRiskConditions(
  items: AncRiskConditionSeed[],
  entityType: 'MOTHER' | 'CHILD',
  phase: 'ANC' | 'INC',
  stepName: string,
): Promise<SeedResult> {
  let createdCount = 0;

  for (const condition of items) {
    const existing = await prisma.riskCondition.findUnique({
      where: { conditionCode: condition.conditionCode },
    });
    if (existing) continue;

    await prisma.riskCondition.create({
      data: {
        conditionCode: condition.conditionCode,
        conditionName: condition.conditionName,
        entityType,
        phase,
        gradeScale: condition.gradeScale,
        referralRequiredDefault: condition.referralRequiredDefault,
        educationRequiredDefault: condition.educationRequiredDefault,
        status: 'ACTIVE',
      },
    });
    createdCount += 1;
  }

  if (createdCount === 0) {
    return {
      step: stepName,
      created: false,
      message: `All ${stepName.replace(/-/g, ' ')} rows already present — skipped.`,
    };
  }
  return {
    step: stepName,
    created: true,
    message: `Seeded ${createdCount} ${stepName.replace(/-/g, ' ')} row(s).`,
  };
}

/**
 * Demo ACCOMPANIED_REFERRAL Quick Response card (SRS FR-SV-4.9). Creates a Referral row
 * (type ACCOMPANIED, status PENDING_FOLLOWUP so the card is decidable) and raises its
 * linked approval_requests row via approval-service's public POST /approvals — the same
 * endpoint any authorized SAKHI/SUPERVISOR caller would use.
 */
async function seedAccompaniedReferralDemo(): Promise<SeedResult> {
  const step = 'accompanied-referral-demo';
  try {
    const pre = await checkReferralDemoPreconditions(DEMO_ACCOMPANIED_REFERRAL_TAG);
    if (!pre.proceed) return { ...pre.result, step };
    const { beneficiaryId, requestedByUserId, authorizationHeader } = pre;

    const referralTypeLookupValueId = await resolveReferralTypeLookupId(
      'ACCOMPANIED',
      authorizationHeader,
    );
    if (!referralTypeLookupValueId) {
      return {
        step,
        created: false,
        message:
          'REFERRAL_TYPE/ACCOMPANIED lookup value not found — is auth-service seeded? Skipped.',
      };
    }

    const referral = await prisma.referral.create({
      data: {
        beneficiaryId,
        referralTypeLookupValueId,
        referralDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        facilityType: 'PHC',
        facilityName: DEMO_ACCOMPANIED_REFERRAL_TAG,
        status: 'PENDING_FOLLOWUP',
      },
    });

    const decisionStatusLookupId = await resolveApprovalStatusPendingId(authorizationHeader);
    if (!decisionStatusLookupId) {
      return {
        step,
        created: true,
        message: `Seeded referral ${referral.id} but no PENDING APPROVAL_STATUS lookup value was found — Quick Response card not raised.`,
      };
    }

    const raised = await raiseApprovalRequest(
      {
        requestType: 'ACCOMPANIED_REFERRAL',
        beneficiaryId,
        referralId: referral.id,
        requestedByUserId,
        decisionStatusLookupId,
      },
      authorizationHeader,
    );

    return {
      step,
      created: true,
      message: raised
        ? `Seeded referral ${referral.id} and raised its ACCOMPANIED_REFERRAL Quick Response card.`
        : `Seeded referral ${referral.id} but raising its Quick Response card failed — check approval-service.`,
    };
  } catch (err) {
    return {
      step,
      created: false,
      message: `Failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Demo REFERRAL_INCOMPLETE Quick Response card (SRS FR-SV-4.5 / Appendix E.4). Creates a
 * Referral row (type STANDARD, status PENDING_FOLLOWUP) plus a child ReferralFollowup row
 * (followupStatus INCOMPLETE, with notVisitedReason set — this is what the card's "reason"
 * / "missed count" fields actually read, per ReferralRepository.findFollowupSummary()), and
 * raises the linked approval_requests row the same way seedAccompaniedReferralDemo does.
 */
async function seedIncompleteReferralDemo(): Promise<SeedResult> {
  const step = 'referral-incomplete-demo';
  try {
    const pre = await checkReferralDemoPreconditions(DEMO_REFERRAL_INCOMPLETE_TAG);
    if (!pre.proceed) return { ...pre.result, step };
    const { beneficiaryId, requestedByUserId, authorizationHeader } = pre;

    const referralTypeLookupValueId = await resolveReferralTypeLookupId(
      'STANDARD',
      authorizationHeader,
    );
    if (!referralTypeLookupValueId) {
      return {
        step,
        created: false,
        message: 'REFERRAL_TYPE/STANDARD lookup value not found — is auth-service seeded? Skipped.',
      };
    }

    const referral = await prisma.referral.create({
      data: {
        beneficiaryId,
        referralTypeLookupValueId,
        referralDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
        facilityType: 'PHC',
        facilityName: DEMO_REFERRAL_INCOMPLETE_TAG,
        status: 'PENDING_FOLLOWUP',
      },
    });

    await prisma.referralFollowup.create({
      data: {
        referralId: referral.id,
        followupDate: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
        followupStatus: 'INCOMPLETE',
        notVisitedReason: 'Beneficiary unavailable at scheduled facility visit.',
      },
    });

    const decisionStatusLookupId = await resolveApprovalStatusPendingId(authorizationHeader);
    if (!decisionStatusLookupId) {
      return {
        step,
        created: true,
        message: `Seeded referral ${referral.id} with an incomplete follow-up, but no PENDING APPROVAL_STATUS lookup value was found — Quick Response card not raised.`,
      };
    }

    const raised = await raiseApprovalRequest(
      {
        requestType: 'REFERRAL_INCOMPLETE',
        beneficiaryId,
        referralId: referral.id,
        requestedByUserId,
        decisionStatusLookupId,
      },
      authorizationHeader,
    );

    return {
      step,
      created: true,
      message: raised
        ? `Seeded referral ${referral.id} with an incomplete follow-up and raised its REFERRAL_INCOMPLETE Quick Response card.`
        : `Seeded referral ${referral.id} with an incomplete follow-up, but raising its Quick Response card failed — check approval-service.`,
    };
  } catch (err) {
    return {
      step,
      created: false,
      message: `Failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Master data for the 19 ANC High-Risk conditions defined in Appendix D
 * ("High risk protocols_Developer's copy - ANC HR", see
 * docs/Appendix_D_High_Risk_Detection_Rules.md, Part 1). `phase: ANC` — these
 * feed the anc-risk.rulesJson.ts RISK rule pack via a conditionCode ->
 * risk_condition_id map that riskAssessment.service.ts builds by looking
 * these rows up before calling evaluateRuleSet.
 */
function seedAncRiskConditions(): Promise<SeedResult> {
  return seedRiskConditions(
    ancRiskConditions as AncRiskConditionSeed[],
    'MOTHER',
    'ANC',
    'anc-risk-conditions',
  );
}

/**
 * Master data for the 12 Infant High-Risk conditions defined in Appendix D
 * ("High risk protocols_Developer's copy - Infant HR", see
 * docs/Appendix_D_High_Risk_Detection_Rules.md, Part 2). Seeded once under
 * `phase: INC` — condition_code has a global UNIQUE constraint (not
 * unique-per-phase), and per SRS §3A.2.4 CCV reuses INC's thresholds
 * verbatim, so both CCV_VISIT and NN (NEONATAL_VISIT) evaluations pass
 * riskPhase: 'INC' to reuse this same seeded set rather than duplicating
 * rows per phase (see infant-risk.rulesJson.ts's own doc comment).
 */
function seedInfantRiskConditions(): Promise<SeedResult> {
  return seedRiskConditions(
    infantRiskConditions as AncRiskConditionSeed[],
    'CHILD',
    'INC',
    'infant-risk-conditions',
  );
}

async function main(): Promise<void> {
  const results = [
    await seedSelfReportedConditions(),
    await seedRiskParameters(),
    await seedAncRiskConditions(),
    await seedInfantRiskConditions(),
    await seedAccompaniedReferralDemo(),
    await seedIncompleteReferralDemo(),
  ];

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
