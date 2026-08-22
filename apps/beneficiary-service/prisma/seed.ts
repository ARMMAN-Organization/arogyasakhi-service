import { createCipheriv, createHmac, randomBytes } from 'node:crypto';
import { PrismaClient } from '../../../node_modules/.prisma/client-beneficiary-service';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

// PII columns are AES-256-GCM encrypted / HMAC-SHA256 search-hashed at the
// application layer (libs/service-commons/src/crypto/pii-crypto.ts). Standalone
// seed scripts here can't import `@armman/*` (see risk-referral-service's
// prisma/seed.ts note — no path-alias registration under plain ts-node), so the
// two functions are duplicated verbatim rather than imported.
function encryptPii(plaintext: string): Buffer {
  const key = Buffer.from(process.env.PII_ENCRYPTION_KEY ?? '', 'base64');
  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY must be set and decode to 32 bytes — cannot seed PII.');
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, ciphertext, cipher.getAuthTag()]);
}

function hashForSearch(normalizedValue: string): Buffer {
  const key = Buffer.from(process.env.PII_SEARCH_HASH_KEY ?? '', 'base64');
  if (key.length !== 32) {
    throw new Error('PII_SEARCH_HASH_KEY must be set and decode to 32 bytes — cannot seed PII.');
  }
  return createHmac('sha256', key).update(normalizedValue, 'utf8').digest();
}

function normalizeForSearch(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ');
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// Fixed geography/project/master-data ids — already seeded on the shared dev
// database by auth-service's own seed data (project + full State→Pada
// geography chain) and risk-referral-service (risk conditions). Override via
// env if a target environment generates these differently.
const PROJECT_ID =
  process.env.SEED_BENEFICIARY_PROJECT_ID ?? '4b4084cf-d572-4020-9438-c82640275201';
const VILLAGE_ID =
  process.env.SEED_BENEFICIARY_VILLAGE_ID ?? '0307a68f-d480-4866-94fa-2094a21f2bb3';
const PADA_ID = process.env.SEED_BENEFICIARY_PADA_ID ?? '7337fe8d-c5b4-418d-81f2-8047e3ab885d';
const SUB_CENTRE_ID =
  process.env.SEED_BENEFICIARY_SUBCENTRE_ID ?? '4e34fa81-bb38-4fee-b254-64111113ff28';
const PHC_ID = process.env.SEED_BENEFICIARY_PHC_ID ?? '8a781eb5-f2a5-432b-8aa2-247d73e84e82';
const BLOCK_ID = process.env.SEED_BENEFICIARY_BLOCK_ID ?? '858b7d8b-b825-4b2e-962f-5c987f1477f4';
const STATE_ID = process.env.SEED_BENEFICIARY_STATE_ID ?? '650e14c8-62a9-4d98-89d6-6b82108bd375';
const DISTRICT_ID =
  process.env.SEED_BENEFICIARY_DISTRICT_ID ?? 'ae59f40c-961f-4f66-a142-73659058518e';

const BENEFICIARY_TYPE_PREGNANT_WOMAN_LOOKUP_ID = '717ada96-2e6c-4fdd-b5c7-7ced61c14b41';
const BENEFICIARY_TYPE_CHILD_LOOKUP_ID = 'ce48bea6-ab28-4603-bcfc-64625db49491';
const CASE_TYPE_MOTHER_LOOKUP_ID = 'b7926eb3-a446-45b4-a42e-0693178dd66b';
const CASE_TYPE_CHILD_LOOKUP_ID = '03fde668-d75d-4c7b-aed1-10e2494bb6be';
// risk_conditions.risk_condition_id (Hypertension / High BP), owned by risk-referral-service.
const HYPERTENSION_RISK_CONDITION_ID = 'cf20ee77-948f-40d6-b046-7c1d9873f763';

interface MotherSeed {
  beneficiaryId: string;
  localCaseUuid: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  registrationDate: string;
  lmpDate: string;
  riskGrade?: 'HIGH' | 'MODERATE';
}

interface ChildSeed {
  beneficiaryId: string;
  localCaseUuid: string;
  fullName: string;
  phone: string;
  dateOfBirth: string;
  registrationDate: string;
}

interface SakhiSeed {
  sakhiUsername: string;
  sakhiUserId: string;
  mothers: MotherSeed[];
  children: ChildSeed[];
}

// Fixed ids reuse exactly what was already created via the live API this
// session — re-running this script against that same database is a no-op;
// against a fresh one (e.g. develop's), it recreates the identical dataset.
const SAKHIS: SakhiSeed[] = [
  {
    sakhiUsername: 'lakshmi.sakhi',
    sakhiUserId: '3df86ec1-8115-4db9-b558-a091f15b5a99',
    mothers: [
      {
        beneficiaryId: 'a29616a5-cc9d-4de2-9bfc-399fa82700ca',
        localCaseUuid: 'seed-lakshmi-mother-1',
        fullName: 'lakshmi.sakhi Mother 1',
        phone: '9876500001',
        dateOfBirth: '1997-02-10',
        registrationDate: '2026-07-01',
        lmpDate: '2026-01-01',
        riskGrade: 'HIGH',
      },
      {
        beneficiaryId: '8fc12c0d-7887-4fe6-b7bc-92ef7d953ff4',
        localCaseUuid: 'seed-lakshmi-mother-2',
        fullName: 'lakshmi.sakhi Mother 2',
        phone: '9876500002',
        dateOfBirth: '1997-03-10',
        registrationDate: '2026-07-02',
        lmpDate: '2026-01-02',
        riskGrade: 'MODERATE',
      },
      {
        beneficiaryId: '22f8e16c-d678-4f08-930e-c85e0dced2dd',
        localCaseUuid: 'seed-lakshmi-mother-3',
        fullName: 'lakshmi.sakhi Mother 3',
        phone: '9876500003',
        dateOfBirth: '1997-04-10',
        registrationDate: '2026-07-03',
        lmpDate: '2026-01-03',
      },
      {
        beneficiaryId: 'a3eeb96a-aa94-4535-b647-5b9f1204a126',
        localCaseUuid: 'seed-lakshmi-mother-4',
        fullName: 'lakshmi.sakhi Mother 4',
        phone: '9876500004',
        dateOfBirth: '1997-05-10',
        registrationDate: '2026-07-04',
        lmpDate: '2026-01-04',
      },
    ],
    children: [
      {
        beneficiaryId: 'e20f17ba-006c-4f5c-8607-7162a9674d2d',
        localCaseUuid: 'seed-lakshmi-child-1',
        fullName: 'lakshmi.sakhi Child 1',
        phone: '9876510001',
        dateOfBirth: '2026-06-11',
        registrationDate: '2026-07-11',
      },
      {
        beneficiaryId: '54a09c3a-1ae7-4b58-bf14-a81798eec698',
        localCaseUuid: 'seed-lakshmi-child-2',
        fullName: 'lakshmi.sakhi Child 2',
        phone: '9876510002',
        dateOfBirth: '2026-06-12',
        registrationDate: '2026-07-12',
      },
    ],
  },
  {
    sakhiUsername: 'nithya.sakhi',
    sakhiUserId: '9252ff42-6904-4005-9184-14cbbb75e84b',
    mothers: [
      {
        beneficiaryId: 'cb2c9ae5-06fe-4a41-a89e-5b93bd9cb8ad',
        localCaseUuid: 'seed-nithya-mother-1',
        fullName: 'nithya.sakhi Mother 1',
        phone: '9876500011',
        dateOfBirth: '1997-02-10',
        registrationDate: '2026-07-01',
        lmpDate: '2026-01-01',
        riskGrade: 'HIGH',
      },
      {
        beneficiaryId: '88baaa7f-b54a-419b-9a25-f59c08b23815',
        localCaseUuid: 'seed-nithya-mother-2',
        fullName: 'nithya.sakhi Mother 2',
        phone: '9876500012',
        dateOfBirth: '1997-03-10',
        registrationDate: '2026-07-02',
        lmpDate: '2026-01-02',
        riskGrade: 'MODERATE',
      },
      {
        beneficiaryId: 'aeec7340-5838-482f-862e-7f778822a4c2',
        localCaseUuid: 'seed-nithya-mother-3',
        fullName: 'nithya.sakhi Mother 3',
        phone: '9876500013',
        dateOfBirth: '1997-04-10',
        registrationDate: '2026-07-03',
        lmpDate: '2026-01-03',
      },
      {
        beneficiaryId: '0bfc9aac-2ef1-496c-b78e-1c8d50cded41',
        localCaseUuid: 'seed-nithya-mother-4',
        fullName: 'nithya.sakhi Mother 4',
        phone: '9876500014',
        dateOfBirth: '1997-05-10',
        registrationDate: '2026-07-04',
        lmpDate: '2026-01-04',
      },
    ],
    children: [
      {
        beneficiaryId: '91143832-c91e-4ca7-a293-7299ed29283c',
        localCaseUuid: 'seed-nithya-child-1',
        fullName: 'nithya.sakhi Child 1',
        phone: '9876510011',
        dateOfBirth: '2026-06-11',
        registrationDate: '2026-07-11',
      },
      {
        beneficiaryId: 'e6002e06-d054-496e-a6ca-2a770a673435',
        localCaseUuid: 'seed-nithya-child-2',
        fullName: 'nithya.sakhi Child 2',
        phone: '9876510012',
        dateOfBirth: '2026-06-12',
        registrationDate: '2026-07-12',
      },
    ],
  },
  {
    sakhiUsername: 'sandhya.sakhi',
    sakhiUserId: 'f84745fd-f105-40d9-bbf0-9127b3948112',
    mothers: [
      {
        beneficiaryId: '2451a47d-da90-41a3-9d79-2fdad3846043',
        localCaseUuid: 'seed-sandhya-mother-1',
        fullName: 'sandhya.sakhi Mother 1',
        phone: '9876500021',
        dateOfBirth: '1997-02-10',
        registrationDate: '2026-07-01',
        lmpDate: '2026-01-01',
        riskGrade: 'HIGH',
      },
      {
        beneficiaryId: '771b04f6-54b9-4446-9381-02deadc53c47',
        localCaseUuid: 'seed-sandhya-mother-2',
        fullName: 'sandhya.sakhi Mother 2',
        phone: '9876500022',
        dateOfBirth: '1997-03-10',
        registrationDate: '2026-07-02',
        lmpDate: '2026-01-02',
        riskGrade: 'MODERATE',
      },
      {
        beneficiaryId: '90a98f9c-9ec2-47b9-87a2-35cdb720e51e',
        localCaseUuid: 'seed-sandhya-mother-3',
        fullName: 'sandhya.sakhi Mother 3',
        phone: '9876500023',
        dateOfBirth: '1997-04-10',
        registrationDate: '2026-07-03',
        lmpDate: '2026-01-03',
      },
      {
        beneficiaryId: '7446bfaa-0d32-4997-ae0a-0cfb77b6726c',
        localCaseUuid: 'seed-sandhya-mother-4',
        fullName: 'sandhya.sakhi Mother 4',
        phone: '9876500024',
        dateOfBirth: '1997-05-10',
        registrationDate: '2026-07-04',
        lmpDate: '2026-01-04',
      },
    ],
    children: [
      {
        beneficiaryId: '5a84e3bf-a396-4182-9ea4-6b0e5a215b69',
        localCaseUuid: 'seed-sandhya-child-1',
        fullName: 'sandhya.sakhi Child 1',
        phone: '9876510021',
        dateOfBirth: '2026-06-11',
        registrationDate: '2026-07-11',
      },
      {
        beneficiaryId: '8d7cdb63-16e8-4dd6-bb65-85a134e24cdf',
        localCaseUuid: 'seed-sandhya-child-2',
        fullName: 'sandhya.sakhi Child 2',
        phone: '9876510022',
        dateOfBirth: '2026-06-12',
        registrationDate: '2026-07-12',
      },
    ],
  },
  {
    sakhiUsername: 'revathi.sakhi',
    sakhiUserId: '079bd637-01a7-45f1-9216-fa819b736e54',
    mothers: [
      {
        beneficiaryId: '1b529119-87d4-408b-904e-94700c5e2c37',
        localCaseUuid: 'seed-revathi-mother-1',
        fullName: 'revathi.sakhi Mother 1',
        phone: '9876500031',
        dateOfBirth: '1997-02-10',
        registrationDate: '2026-07-01',
        lmpDate: '2026-01-01',
        riskGrade: 'HIGH',
      },
      {
        beneficiaryId: '989f33f2-236e-4b2b-a943-04258d9bb8c0',
        localCaseUuid: 'seed-revathi-mother-2',
        fullName: 'revathi.sakhi Mother 2',
        phone: '9876500032',
        dateOfBirth: '1997-03-10',
        registrationDate: '2026-07-02',
        lmpDate: '2026-01-02',
        riskGrade: 'MODERATE',
      },
      {
        beneficiaryId: '7938f2fc-337c-4a9c-86ed-63f10fb19438',
        localCaseUuid: 'seed-revathi-mother-3',
        fullName: 'revathi.sakhi Mother 3',
        phone: '9876500033',
        dateOfBirth: '1997-04-10',
        registrationDate: '2026-07-03',
        lmpDate: '2026-01-03',
      },
      {
        beneficiaryId: '9cd6a2f6-2000-4e84-99ac-7933da0e34e1',
        localCaseUuid: 'seed-revathi-mother-4',
        fullName: 'revathi.sakhi Mother 4',
        phone: '9876500034',
        dateOfBirth: '1997-05-10',
        registrationDate: '2026-07-04',
        lmpDate: '2026-01-04',
      },
    ],
    children: [
      {
        beneficiaryId: '56eb51a0-4c8b-44b4-8e5d-02dc89225508',
        localCaseUuid: 'seed-revathi-child-1',
        fullName: 'revathi.sakhi Child 1',
        phone: '9876510031',
        dateOfBirth: '2026-06-11',
        registrationDate: '2026-07-11',
      },
      {
        beneficiaryId: 'bd8d91fa-8053-4cb9-b31f-6b7176acb96f',
        localCaseUuid: 'seed-revathi-child-2',
        fullName: 'revathi.sakhi Child 2',
        phone: '9876510032',
        dateOfBirth: '2026-06-12',
        registrationDate: '2026-07-12',
      },
    ],
  },
  {
    sakhiUsername: 'shobana.sakhi',
    sakhiUserId: '63407922-ecb4-4812-be4e-4567938bfb20',
    mothers: [
      {
        beneficiaryId: '34460e35-1f86-499e-9efb-973f2de02dff',
        localCaseUuid: 'seed-shobana-mother-1',
        fullName: 'shobana.sakhi Mother 1',
        phone: '9876500041',
        dateOfBirth: '1997-02-10',
        registrationDate: '2026-07-01',
        lmpDate: '2026-01-01',
        riskGrade: 'HIGH',
      },
      {
        beneficiaryId: '342e8e0e-00ad-494d-be41-adecb9b70bd8',
        localCaseUuid: 'seed-shobana-mother-2',
        fullName: 'shobana.sakhi Mother 2',
        phone: '9876500042',
        dateOfBirth: '1997-03-10',
        registrationDate: '2026-07-02',
        lmpDate: '2026-01-02',
        riskGrade: 'MODERATE',
      },
      {
        beneficiaryId: 'fb03e8e7-5a19-40fd-8400-af42ad1aaff6',
        localCaseUuid: 'seed-shobana-mother-3',
        fullName: 'shobana.sakhi Mother 3',
        phone: '9876500043',
        dateOfBirth: '1997-04-10',
        registrationDate: '2026-07-03',
        lmpDate: '2026-01-03',
      },
      {
        beneficiaryId: '94594dbe-48cc-4905-90bc-336b123e824e',
        localCaseUuid: 'seed-shobana-mother-4',
        fullName: 'shobana.sakhi Mother 4',
        phone: '9876500044',
        dateOfBirth: '1997-05-10',
        registrationDate: '2026-07-04',
        lmpDate: '2026-01-04',
      },
    ],
    children: [
      {
        beneficiaryId: 'dbc7e805-af1e-4b14-80ce-8076ae080de7',
        localCaseUuid: 'seed-shobana-child-1',
        fullName: 'shobana.sakhi Child 1',
        phone: '9876510041',
        dateOfBirth: '2026-06-11',
        registrationDate: '2026-07-11',
      },
      {
        beneficiaryId: 'a6f18f05-dba8-47b8-9159-0938b23e06d5',
        localCaseUuid: 'seed-shobana-child-2',
        fullName: 'shobana.sakhi Child 2',
        phone: '9876510042',
        dateOfBirth: '2026-06-12',
        registrationDate: '2026-07-12',
      },
    ],
  },
];

async function createPii(fullName: string, phone: string, dateOfBirth: string): Promise<string> {
  const pii = await prisma.beneficiaryPii.create({
    data: {
      fullNameEnc: encryptPii(fullName),
      fullNameSearchHash: hashForSearch(normalizeForSearch(fullName)),
      phoneEnc: encryptPii(phone),
      phoneSearchHash: hashForSearch(normalizeForSearch(phone)),
      villageId: VILLAGE_ID,
      padaId: PADA_ID,
      healthSubCentreId: SUB_CENTRE_ID,
      phcId: PHC_ID,
      healthBlockId: BLOCK_ID,
      stateId: STATE_ID,
      districtId: DISTRICT_ID,
      dateOfBirth: new Date(dateOfBirth),
    },
  });
  return pii.id;
}

async function seedMother(sakhi: SakhiSeed, mother: MotherSeed): Promise<boolean> {
  const existing = await prisma.beneficiaryCase.findUnique({ where: { id: mother.beneficiaryId } });
  if (existing) return false;

  const piiId = await createPii(mother.fullName, mother.phone, mother.dateOfBirth);
  const registrationDate = new Date(mother.registrationDate);
  const lmpDate = new Date(mother.lmpDate);

  await prisma.beneficiaryCase.create({
    data: {
      id: mother.beneficiaryId,
      localCaseUuid: mother.localCaseUuid,
      piiId,
      projectId: PROJECT_ID,
      caseType: 'MOTHER',
      sakhiId: sakhi.sakhiUserId,
      registrationDate,
      currentPhase: 'ANC',
      beneficiaryTypeLookupId: BENEFICIARY_TYPE_PREGNANT_WOMAN_LOOKUP_ID,
      caseTypeLookupId: CASE_TYPE_MOTHER_LOOKUP_ID,
      journeyStartDate: registrationDate,
      motherCaseDetails: {
        create: { lmpDate, eddDate: addDays(lmpDate, 280) },
      },
      consentRecords: {
        create: {
          consentType: 'PROGRAM_ENROLLMENT',
          consentStatus: 'GIVEN',
          consentDate: registrationDate,
          capturedByUserId: sakhi.sakhiUserId,
        },
      },
      ...(mother.riskGrade && {
        riskConditionSummaries: {
          create: {
            riskConditionId: HYPERTENSION_RISK_CONDITION_ID,
            phase: 'ANC',
            latestGrade: mother.riskGrade,
            latestGradeRank: mother.riskGrade === 'HIGH' ? 4 : 2,
            latestAssessedAt: new Date('2026-08-15T00:00:00.000Z'),
            everHighestGrade: mother.riskGrade,
            everHighestGradeRank: mother.riskGrade === 'HIGH' ? 4 : 2,
            everHighestAssessedAt: new Date('2026-08-15T00:00:00.000Z'),
            everAtRiskFlag: true,
            currentReferralTriggerFlag: mother.riskGrade === 'HIGH',
            currentHrVisitTriggerFlag: true,
          },
        },
      }),
    },
  });
  return true;
}

async function seedChild(sakhi: SakhiSeed, child: ChildSeed): Promise<boolean> {
  const existing = await prisma.beneficiaryCase.findUnique({ where: { id: child.beneficiaryId } });
  if (existing) return false;

  const piiId = await createPii(child.fullName, child.phone, child.dateOfBirth);
  const registrationDate = new Date(child.registrationDate);
  const dateOfBirth = new Date(child.dateOfBirth);

  await prisma.beneficiaryCase.create({
    data: {
      id: child.beneficiaryId,
      localCaseUuid: child.localCaseUuid,
      piiId,
      projectId: PROJECT_ID,
      caseType: 'CHILD',
      sakhiId: sakhi.sakhiUserId,
      registrationDate,
      currentPhase: 'NN',
      beneficiaryTypeLookupId: BENEFICIARY_TYPE_CHILD_LOOKUP_ID,
      caseTypeLookupId: CASE_TYPE_CHILD_LOOKUP_ID,
      journeyStartDate: registrationDate,
      childCaseDetails: {
        create: { dateOfBirth },
      },
      consentRecords: {
        create: {
          consentType: 'PROGRAM_ENROLLMENT',
          consentStatus: 'GIVEN',
          consentDate: registrationDate,
          capturedByUserId: sakhi.sakhiUserId,
        },
      },
    },
  });
  return true;
}

/**
 * Supervisor-app QA fixture: 4 mother + 2 child beneficiary cases per sakhi
 * (5 sakhis — lakshmi/nithya/sandhya/revathi/shobana), with the first two
 * mothers per sakhi flagged HIGH/MODERATE risk so `atRiskOnly=true` and the
 * risk-summary dashboard return non-empty results.
 */
async function seedSupervisorAppBeneficiaries(): Promise<SeedResult> {
  let created = 0;
  let skipped = 0;

  for (const sakhi of SAKHIS) {
    for (const mother of sakhi.mothers) {
      if (await seedMother(sakhi, mother)) created++;
      else skipped++;
    }
    for (const child of sakhi.children) {
      if (await seedChild(sakhi, child)) created++;
      else skipped++;
    }
  }

  return {
    step: 'supervisor-app-beneficiaries',
    created: created > 0,
    message: `Created ${created} beneficiary case(s), skipped ${skipped} already-seeded row(s).`,
  };
}

async function main(): Promise<void> {
  const results = [await seedSupervisorAppBeneficiaries()];

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
