import { PrismaClient } from '../../../node_modules/.prisma/client-notification-escalation-service';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

// One beneficiary case per sakhi (the first mother seeded by
// beneficiary-service's own prisma/seed.ts) — used as beneficiaryId for both
// escalation types below.
const SAKHIS: { username: string; firstBeneficiaryId: string }[] = [
  { username: 'lakshmi.sakhi', firstBeneficiaryId: 'a29616a5-cc9d-4de2-9bfc-399fa82700ca' },
  { username: 'nithya.sakhi', firstBeneficiaryId: 'cb2c9ae5-06fe-4a41-a89e-5b93bd9cb8ad' },
  { username: 'sandhya.sakhi', firstBeneficiaryId: '2451a47d-da90-41a3-9d79-2fdad3846043' },
  { username: 'revathi.sakhi', firstBeneficiaryId: '1b529119-87d4-408b-904e-94700c5e2c37' },
  { username: 'shobana.sakhi', firstBeneficiaryId: '34460e35-1f86-499e-9efb-973f2de02dff' },
];

const ESCALATION_TYPES: ('ANC_2_MISSED' | 'EDD_NEARING')[] = ['ANC_2_MISSED', 'EDD_NEARING'];

/**
 * Supervisor-app "Quick Response" QA fixture: one OPEN escalation_events row
 * per type (ANC_2_MISSED → the MISSED_VISIT card, and EDD_NEARING) per sakhi
 * (5) = 10 rows, so `GET /quick-response` returns real cards for both
 * notification-escalation-service-backed card types.
 */
async function seedSupervisorAppEscalations(): Promise<SeedResult> {
  let created = 0;
  let skipped = 0;

  for (const sakhi of SAKHIS) {
    for (const escalationType of ESCALATION_TYPES) {
      const existing = await prisma.escalationEvent.findFirst({
        where: { beneficiaryId: sakhi.firstBeneficiaryId, escalationType },
      });
      if (existing) {
        skipped += 1;
        continue;
      }

      await prisma.escalationEvent.create({
        data: {
          beneficiaryId: sakhi.firstBeneficiaryId,
          escalationType,
          status: 'OPEN',
        },
      });
      created += 1;
    }
  }

  return {
    step: 'supervisor-app-escalations',
    created: created > 0,
    message: `Created ${created} escalation event(s), skipped ${skipped} already-seeded row(s).`,
  };
}

async function main(): Promise<void> {
  const results = [await seedSupervisorAppEscalations()];

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
