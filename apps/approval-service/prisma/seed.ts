import { PrismaClient } from '../../../node_modules/.prisma/client-approval-service';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

// lookup_values.lookup_value_id (category APPROVAL_STATUS, code PENDING),
// owned by auth-service — cross-service scalar ref, not FK-enforced.
const APPROVAL_STATUS_PENDING_LOOKUP_ID = 'e08a9cac-cafd-4e6b-bf68-c41ee9037cdf';

const CARD_TYPES: (
  | 'LMP_CHANGE'
  | 'CLOSURE_REVIEW'
  | 'REOPEN'
  | 'ACCOMPANIED_REFERRAL'
  | 'REFERRAL_INCOMPLETE'
  | 'DATA_RESTORE'
)[] = [
  'LMP_CHANGE',
  'CLOSURE_REVIEW',
  'REOPEN',
  'ACCOMPANIED_REFERRAL',
  'REFERRAL_INCOMPLETE',
  'DATA_RESTORE',
];

// One beneficiary case per sakhi (the first mother seeded by
// beneficiary-service's own prisma/seed.ts) — used as sourceEntityId/
// beneficiaryId for the 5 card types that reference a beneficiary.
// DATA_RESTORE has no beneficiary of its own; it targets the sakhi's User row.
const SAKHIS: { username: string; sakhiUserId: string; firstBeneficiaryId: string }[] = [
  {
    username: 'lakshmi.sakhi',
    sakhiUserId: '3df86ec1-8115-4db9-b558-a091f15b5a99',
    firstBeneficiaryId: 'a29616a5-cc9d-4de2-9bfc-399fa82700ca',
  },
  {
    username: 'nithya.sakhi',
    sakhiUserId: '9252ff42-6904-4005-9184-14cbbb75e84b',
    firstBeneficiaryId: 'cb2c9ae5-06fe-4a41-a89e-5b93bd9cb8ad',
  },
  {
    username: 'sandhya.sakhi',
    sakhiUserId: 'f84745fd-f105-40d9-bbf0-9127b3948112',
    firstBeneficiaryId: '2451a47d-da90-41a3-9d79-2fdad3846043',
  },
  {
    username: 'revathi.sakhi',
    sakhiUserId: '079bd637-01a7-45f1-9216-fa819b736e54',
    firstBeneficiaryId: '1b529119-87d4-408b-904e-94700c5e2c37',
  },
  {
    username: 'shobana.sakhi',
    sakhiUserId: '63407922-ecb4-4812-be4e-4567938bfb20',
    firstBeneficiaryId: '34460e35-1f86-499e-9efb-973f2de02dff',
  },
];

/**
 * Supervisor-app "Quick Response" QA fixture: one PENDING approval_requests
 * row per card type (6) per sakhi (5) = 30 rows, so `GET /quick-response`
 * returns real cards for every approval-service-backed card type.
 */
async function seedSupervisorAppApprovals(): Promise<SeedResult> {
  let created = 0;
  let skipped = 0;

  for (const sakhi of SAKHIS) {
    for (const requestType of CARD_TYPES) {
      const isDataRestore = requestType === 'DATA_RESTORE';
      const sourceEntityId = isDataRestore ? sakhi.sakhiUserId : sakhi.firstBeneficiaryId;

      const existing = await prisma.approvalRequest.findFirst({
        where: { requestedByUserId: sakhi.sakhiUserId, requestType },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await prisma.approvalRequest.create({
        data: {
          requestType,
          sourceEntityType: isDataRestore ? 'User' : 'BeneficiaryCase',
          sourceEntityId,
          beneficiaryId: isDataRestore ? undefined : sakhi.firstBeneficiaryId,
          requestedByUserId: sakhi.sakhiUserId,
          decisionStatusLookupId: APPROVAL_STATUS_PENDING_LOOKUP_ID,
        },
      });
      created += 1;
    }
  }

  return {
    step: 'supervisor-app-approvals',
    created: created > 0,
    message: `Created ${created} approval request(s), skipped ${skipped} already-seeded row(s).`,
  };
}

async function main(): Promise<void> {
  const results = [await seedSupervisorAppApprovals()];

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
