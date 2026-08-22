import { createHash } from 'node:crypto';
import { PrismaClient } from '../../../node_modules/.prisma/client-visit-form-service';
import motherRegistrationPayload from './seed-data/mother-registration.json';
import childRegistrationPayload from './seed-data/child-registration.json';
import ancVisitPayload from './seed-data/anc-visit.json';
import infantVisitPayload from './seed-data/infant-visit.json';
import deliveryVisitPayload from './seed-data/delivery-visit.json';
import postpartumVisitPayload from './seed-data/postpartum-visit.json';
import neonatalVisitPayload from './seed-data/neonatal-visit.json';
import referralVisitPayload from './seed-data/referral-visit.json';
import referralFollowupVisitPayload from './seed-data/referral-followup-visit.json';
import ancClosureVisitPayload from './seed-data/anc-closure-visit.json';
import childClosureVisitPayload from './seed-data/child-closure-visit.json';
import beneficiaryReopenVisitPayload from './seed-data/beneficiary-reopen-visit.json';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

interface FormDraft {
  formCode: string;
  formName: string;
  entityType: 'MOTHER' | 'CHILD' | 'REFERRAL' | 'SYSTEM';
  versionNo: string;
  payload: { schemaJson: unknown[]; validationJson: unknown[] };
}

/** Same checksum computation as FormService — sha256 over the schema JSON. */
function computeChecksum(schemaJson: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(schemaJson)).digest();
}

/**
 * Form master data — the registration forms defined by the ERD's
 * form_definitions master list (form_code MOTHER_REGISTRATION /
 * CHILD_REGISTRATION). Content lives in ./seed-data/*.json rather than
 * inline here: each file is the exact field set transcribed field-for-field
 * from docs/Revised_App_Form_Final_20.3.26.xlsx.md ("Registration_PW_D" /
 * "Infant Registration form" sheets), in the same section/order as those
 * sheets — the same payload the admin form-authoring API accepts, so this
 * file stays interchangeable with a live PATCH .../versions/:id call.
 *
 * This is real master data required in every environment for the dynamic
 * enrollment form to render — not test data. Seeded as a single PUBLISHED
 * version per form so `GET /forms/:formCode/active-version` returns
 * immediately, with no dependency on any service being up.
 */
const FORMS: FormDraft[] = [
  {
    formCode: 'MOTHER_REGISTRATION',
    formName: 'Pregnant Woman Registration',
    entityType: 'MOTHER',
    versionNo: 'v1',
    payload: motherRegistrationPayload,
  },
  {
    formCode: 'CHILD_REGISTRATION',
    formName: 'Infant Registration',
    entityType: 'CHILD',
    versionNo: 'v1',
    payload: childRegistrationPayload,
  },
  {
    formCode: 'ANC_VISIT',
    formName: 'ANC Visit',
    entityType: 'MOTHER',
    versionNo: 'v1',
    payload: ancVisitPayload,
  },
  {
    formCode: 'INFANT_VISIT',
    formName: 'Infant Visit',
    entityType: 'CHILD',
    versionNo: 'v1',
    payload: infantVisitPayload,
  },
  // Alias of INFANT_VISIT under the SRS's own name for the 0-12m phase (per
  // SRS v3.0 §"Home Visit Forms": ANC, PP, NN, INC, CCV, Delivery are each
  // distinct forms). Same schema content as INFANT_VISIT — kept as a
  // separate form_definitions row (not a rename) so any existing caller of
  // GET /forms/INFANT_VISIT/active-version is unaffected; INC_VISIT is the
  // name new client code should move to.
  {
    formCode: 'INC_VISIT',
    formName: 'Infant Care Visit (INC)',
    entityType: 'CHILD',
    versionNo: 'v1',
    payload: infantVisitPayload,
  },
  // CCV (13-24m) is confirmed in SRS v3.0 to reuse INC's clinical fields and
  // HR thresholds verbatim — "No separate CCV-specific guidelines required"
  // (Niharika Vyas, May 2026). Same schema content as INC_VISIT/INFANT_VISIT
  // until ARMMAN provides CCV-specific fields, at which point only this one
  // form_definitions row needs a new version — INC_VISIT stays unaffected.
  {
    formCode: 'CCV_VISIT',
    formName: 'Child Care Visit (CCV)',
    entityType: 'CHILD',
    versionNo: 'v1',
    payload: infantVisitPayload,
  },
  {
    formCode: 'DELIVERY_VISIT',
    formName: 'Delivery Visit',
    entityType: 'MOTHER',
    versionNo: 'v1',
    payload: deliveryVisitPayload,
  },
  {
    formCode: 'POSTPARTUM_VISIT',
    formName: 'Postpartum Visit',
    entityType: 'MOTHER',
    versionNo: 'v1',
    payload: postpartumVisitPayload,
  },
  {
    formCode: 'NEONATAL_VISIT',
    formName: 'Neonatal Visit',
    entityType: 'CHILD',
    versionNo: 'v1',
    payload: neonatalVisitPayload,
  },
  // Referral, closure, and reopen workflow forms — transcribed field-for-field
  // from docs/Revised_App_Form_Final_20.3.26.xlsx.md ("Referral form",
  // "ANC Closure form _D", "Child Closure form", "Beneficiary reopen form").
  // Not triggered by a VisitSchedule/VisitCodeType today (same as
  // MOTHER_REGISTRATION/CHILD_REGISTRATION) — the app calls
  // GET /forms/:formCode/active-version directly by these codes.
  {
    formCode: 'REFERRAL_VISIT',
    formName: 'Referral',
    entityType: 'REFERRAL',
    versionNo: 'v1',
    payload: referralVisitPayload,
  },
  // Distinct form code from REFERRAL_VISIT — SRS treats the initial referral
  // and its 7-day follow-up as separate entities with separate linelists
  // (Referral Linelist vs. Referral Follow-up Linelist), not one form with a
  // mode flag.
  {
    formCode: 'REFERRAL_FOLLOWUP_VISIT',
    formName: 'Referral Follow-up',
    entityType: 'REFERRAL',
    versionNo: 'v1',
    payload: referralFollowupVisitPayload,
  },
  {
    formCode: 'ANC_CLOSURE_VISIT',
    formName: 'ANC Closure',
    entityType: 'MOTHER',
    versionNo: 'v1',
    payload: ancClosureVisitPayload,
  },
  {
    formCode: 'CHILD_CLOSURE_VISIT',
    formName: 'Child Closure',
    entityType: 'CHILD',
    versionNo: 'v1',
    payload: childClosureVisitPayload,
  },
  // Not MOTHER- or CHILD-specific — a reopen request can target either a
  // closed ANC or a closed child case, so this uses SYSTEM rather than
  // defaulting to one entity.
  {
    formCode: 'BENEFICIARY_REOPEN_VISIT',
    formName: 'Beneficiary Reopen',
    entityType: 'SYSTEM',
    versionNo: 'v1',
    payload: beneficiaryReopenVisitPayload,
  },
];

async function seedForms(): Promise<SeedResult> {
  let createdDefs = 0;

  for (const form of FORMS) {
    const existing = await prisma.formDefinition.findUnique({
      where: { formCode: form.formCode },
    });
    if (existing) continue;

    await prisma.formDefinition.create({
      data: {
        formCode: form.formCode,
        formName: form.formName,
        entityType: form.entityType,
        status: 'ACTIVE',
        formVersions: {
          create: {
            versionNo: form.versionNo,
            schemaJson: form.payload.schemaJson as never,
            validationJson: form.payload.validationJson as never,
            checksum: computeChecksum(form.payload.schemaJson),
            status: 'PUBLISHED',
            effectiveFrom: new Date(),
          },
        },
      },
    });
    createdDefs += 1;
  }

  if (createdDefs === 0) {
    return {
      step: 'forms',
      created: false,
      message: 'All registration forms already present — skipped.',
    };
  }
  return {
    step: 'forms',
    created: true,
    message: `Seeded ${createdDefs} registration form definition(s) with a published version.`,
  };
}

type VisitCodeType =
  | 'ANC'
  | 'ANC_HR'
  | 'ANC_POST_EDD'
  | 'DELIVERY'
  | 'PP'
  | 'NN'
  | 'INC'
  | 'INC_HR'
  | 'CCV'
  | 'CCV_HR';

interface VisitMasterSeed {
  visitCode: string;
  visitType: VisitCodeType;
  displayName: string;
  entityType: 'MOTHER' | 'CHILD';
  sequenceOrder: number | null;
  description: string;
}

/**
 * Visit master catalog — the SRS's named visit-type definitions, transcribed
 * from docs/Arogya_Sakhi_SRS_v3.0.md Appendix A ("Visit Schedule Rules") and
 * Appendix B ("Visit Windows Summary"). Real master data required in every
 * environment for the Supervisor app's "Download Master Data" screen's
 * "Visit Master" row — not test data. `_REGULAR` rows (ANC_REGULAR,
 * INC_REGULAR, CCV_REGULAR) are templates standing in for the variable
 * number of actual generated ANC2-ANCn / INC2-INCn / CCV1-CCVn visits, since
 * those aren't a fixed, enumerable set of codes the way ANC1/PP1-5/NN1-2/
 * INC1 are.
 */
const VISIT_MASTERS: VisitMasterSeed[] = [
  {
    visitCode: 'ANC1',
    visitType: 'ANC',
    displayName: 'ANC Visit 1',
    entityType: 'MOTHER',
    sequenceOrder: 1,
    description: 'Registration date (Day 0). Window: Day 0 to Day +5.',
  },
  {
    visitCode: 'ANC_REGULAR',
    visitType: 'ANC',
    displayName: 'ANC Visit (Regular, 2 onward)',
    entityType: 'MOTHER',
    sequenceOrder: null,
    description:
      'Previous scheduled date + 30 days. Window: Schedule -5 to Schedule +5. ' +
      'Template for ANC2-ANCn.',
  },
  {
    visitCode: 'ANC_HR',
    visitType: 'ANC_HR',
    displayName: 'ANC High-Risk Visit',
    entityType: 'MOTHER',
    sequenceOrder: null,
    description: 'Actual visit date + 15 days. Window: Anchor -2 to Anchor +2.',
  },
  {
    visitCode: 'ANC_POST_EDD',
    visitType: 'ANC_POST_EDD',
    displayName: 'ANC Post-EDD Visit',
    entityType: 'MOTHER',
    sequenceOrder: null,
    description: 'EDD + 8. Window: EDD +8 to EDD +13.',
  },
  {
    visitCode: 'PP1',
    visitType: 'PP',
    displayName: 'Postpartum Visit 1',
    entityType: 'MOTHER',
    sequenceOrder: 1,
    description: 'Day 0 (delivery date). Window: Day 0 to Day +14.',
  },
  {
    visitCode: 'PP2',
    visitType: 'PP',
    displayName: 'Postpartum Visit 2',
    entityType: 'MOTHER',
    sequenceOrder: 2,
    description: 'Day +15. Window: Day +15 to Day +28.',
  },
  {
    visitCode: 'PP3',
    visitType: 'PP',
    displayName: 'Postpartum Visit 3',
    entityType: 'MOTHER',
    sequenceOrder: 3,
    description: 'Day +58. Window: Day +53 to Day +63.',
  },
  {
    visitCode: 'PP4',
    visitType: 'PP',
    displayName: 'Postpartum Visit 4',
    entityType: 'MOTHER',
    sequenceOrder: 4,
    description: 'Day +88. Window: Day +83 to Day +93.',
  },
  {
    visitCode: 'PP5',
    visitType: 'PP',
    displayName: 'Postpartum Visit 5',
    entityType: 'MOTHER',
    sequenceOrder: 5,
    description:
      'Day +118. Window: Day +113 to Day +123. Completion triggers mother closure prompt.',
  },
  {
    visitCode: 'NN1',
    visitType: 'NN',
    displayName: 'Neonatal Visit 1',
    entityType: 'CHILD',
    sequenceOrder: 1,
    description: 'With delivery form. Window: Day 0 to Day +14.',
  },
  {
    visitCode: 'NN2',
    visitType: 'NN',
    displayName: 'Neonatal Visit 2',
    entityType: 'CHILD',
    sequenceOrder: 2,
    description: 'Day +15. Window: Day +15 to Day +28.',
  },
  {
    visitCode: 'INC1',
    visitType: 'INC',
    displayName: 'Infant Care Visit 1',
    entityType: 'CHILD',
    sequenceOrder: 1,
    description:
      'Early registration (Day 0-58): DOB +58, window DOB +53 to DOB +63. ' +
      'Late registration (after Day 58): registration date, window Reg date -5 to Reg date +5.',
  },
  {
    visitCode: 'INC_REGULAR',
    visitType: 'INC',
    displayName: 'Infant Care Visit (Regular, 2 onward)',
    entityType: 'CHILD',
    sequenceOrder: null,
    description:
      'Previous scheduled + 30 days. Window: Schedule -5 to Schedule +5. ' +
      'Template for INC2-INCn.',
  },
  {
    visitCode: 'INC_HR',
    visitType: 'INC_HR',
    displayName: 'Infant Care High-Risk Visit',
    entityType: 'CHILD',
    sequenceOrder: null,
    description: 'Actual visit + 15 days. Window: Anchor -2 to Anchor +2.',
  },
  {
    visitCode: 'CCV_REGULAR',
    visitType: 'CCV',
    displayName: 'Child Continuum Visit (Regular)',
    entityType: 'CHILD',
    sequenceOrder: null,
    description:
      'State-dependent cadence (monthly, or every 2 months, per current risk state). ' +
      'Window: Schedule -5 to Schedule +5. Template for CCV1-CCVn.',
  },
  {
    visitCode: 'CCV_HR_SAM',
    visitType: 'CCV_HR',
    displayName: 'Child Continuum High-Risk Visit (SAM)',
    entityType: 'CHILD',
    sequenceOrder: null,
    description:
      'Actual visit + 30 days (SAM or danger sign detected in last 3 INC/CCV visits). ' +
      'Window: Schedule -5 to Schedule +5.',
  },
  {
    visitCode: 'CCV_HR_OTHER',
    visitType: 'CCV_HR',
    displayName: 'Child Continuum High-Risk Visit (Other)',
    entityType: 'CHILD',
    sequenceOrder: null,
    description:
      'Actual visit + 30 days (other high-risk condition detected in last 3 INC/CCV visits). ' +
      'Window: Schedule -5 to Schedule +5.',
  },
];

async function seedVisitMasters(): Promise<SeedResult> {
  let createdCount = 0;

  for (const row of VISIT_MASTERS) {
    const existing = await prisma.visitMaster.findUnique({ where: { visitCode: row.visitCode } });
    if (existing) continue;

    await prisma.visitMaster.create({ data: row });
    createdCount += 1;
  }

  if (createdCount === 0) {
    return {
      step: 'visitMasters',
      created: false,
      message: 'All visit master rows already present — skipped.',
    };
  }
  return {
    step: 'visitMasters',
    created: true,
    message: `Seeded ${createdCount} visit master row(s).`,
  };
}

// rule_versions.rule_version_id (generic SCHEDULE pack, PUBLISHED), owned by
// rules-service — cross-service scalar ref, not FK-enforced (forklift rule).
const GENERIC_RULE_VERSION_ID = '22222222-2222-4222-8222-222222222222';
// lookup_values.lookup_value_id (category VISIT_STATUS), owned by auth-service.
const VISIT_STATUS_PENDING_LOOKUP_ID = 'b2260191-2da0-4f18-92b1-0f271912effc';
const VISIT_STATUS_MISSED_LOOKUP_ID = '618732a3-20f6-46bd-99b1-83845920d662';
const VISIT_STATUS_COMPLETED_LOOKUP_ID = 'e40ece64-58b6-4fb7-9daf-5a0ca529606f';

interface SupervisorAppVisitSeed {
  sakhiId: string;
  beneficiaryId: string;
  localUuidSuffix: string;
  statusLookupValueId: string;
}

// One visit per beneficiary case seeded by beneficiary-service's own
// prisma/seed.ts (same fixed beneficiary ids), cycling PENDING/MISSED/COMPLETED
// across each sakhi's 6 beneficiaries — reuses exactly what was created via the
// live API this session, so re-running against that database is a no-op.
const SUPERVISOR_APP_VISITS: SupervisorAppVisitSeed[] = [
  ...[
    {
      sakhi: 'lakshmi',
      sakhiId: '3df86ec1-8115-4db9-b558-a091f15b5a99',
      beneficiaryIds: [
        'a29616a5-cc9d-4de2-9bfc-399fa82700ca',
        '8fc12c0d-7887-4fe6-b7bc-92ef7d953ff4',
        '22f8e16c-d678-4f08-930e-c85e0dced2dd',
        'a3eeb96a-aa94-4535-b647-5b9f1204a126',
        'e20f17ba-006c-4f5c-8607-7162a9674d2d',
        '54a09c3a-1ae7-4b58-bf14-a81798eec698',
      ],
    },
    {
      sakhi: 'nithya',
      sakhiId: '9252ff42-6904-4005-9184-14cbbb75e84b',
      beneficiaryIds: [
        'cb2c9ae5-06fe-4a41-a89e-5b93bd9cb8ad',
        '88baaa7f-b54a-419b-9a25-f59c08b23815',
        'aeec7340-5838-482f-862e-7f778822a4c2',
        '0bfc9aac-2ef1-496c-b78e-1c8d50cded41',
        '91143832-c91e-4ca7-a293-7299ed29283c',
        'e6002e06-d054-496e-a6ca-2a770a673435',
      ],
    },
    {
      sakhi: 'sandhya',
      sakhiId: 'f84745fd-f105-40d9-bbf0-9127b3948112',
      beneficiaryIds: [
        '2451a47d-da90-41a3-9d79-2fdad3846043',
        '771b04f6-54b9-4446-9381-02deadc53c47',
        '90a98f9c-9ec2-47b9-87a2-35cdb720e51e',
        '7446bfaa-0d32-4997-ae0a-0cfb77b6726c',
        '5a84e3bf-a396-4182-9ea4-6b0e5a215b69',
        '8d7cdb63-16e8-4dd6-bb65-85a134e24cdf',
      ],
    },
    {
      sakhi: 'revathi',
      sakhiId: '079bd637-01a7-45f1-9216-fa819b736e54',
      beneficiaryIds: [
        '1b529119-87d4-408b-904e-94700c5e2c37',
        '989f33f2-236e-4b2b-a943-04258d9bb8c0',
        '7938f2fc-337c-4a9c-86ed-63f10fb19438',
        '9cd6a2f6-2000-4e84-99ac-7933da0e34e1',
        '56eb51a0-4c8b-44b4-8e5d-02dc89225508',
        'bd8d91fa-8053-4cb9-b31f-6b7176acb96f',
      ],
    },
    {
      sakhi: 'shobana',
      sakhiId: '63407922-ecb4-4812-be4e-4567938bfb20',
      beneficiaryIds: [
        '34460e35-1f86-499e-9efb-973f2de02dff',
        '342e8e0e-00ad-494d-be41-adecb9b70bd8',
        'fb03e8e7-5a19-40fd-8400-af42ad1aaff6',
        '94594dbe-48cc-4905-90bc-336b123e824e',
        'dbc7e805-af1e-4b14-80ce-8076ae080de7',
        'a6f18f05-dba8-47b8-9159-0938b23e06d5',
      ],
    },
  ].flatMap(({ sakhi, sakhiId, beneficiaryIds }) => {
    const statuses = [
      VISIT_STATUS_PENDING_LOOKUP_ID,
      VISIT_STATUS_MISSED_LOOKUP_ID,
      VISIT_STATUS_COMPLETED_LOOKUP_ID,
      VISIT_STATUS_PENDING_LOOKUP_ID,
      VISIT_STATUS_MISSED_LOOKUP_ID,
      VISIT_STATUS_COMPLETED_LOOKUP_ID,
    ];
    return beneficiaryIds.map((beneficiaryId, i) => ({
      sakhiId,
      beneficiaryId,
      localUuidSuffix: `${sakhi}-${i + 1}`,
      statusLookupValueId: statuses[i],
    }));
  }),
];

/**
 * Supervisor-app QA fixture: one VisitSchedule + VisitInstance per beneficiary
 * case seeded by beneficiary-service (30 total across 5 sakhis), cycling
 * PENDING/MISSED/COMPLETED so the Visit Summary screen has non-zero counts in
 * every status bucket.
 */
async function seedSupervisorAppVisits(): Promise<SeedResult> {
  let created = 0;
  let skipped = 0;

  for (const visit of SUPERVISOR_APP_VISITS) {
    const localScheduleUuid = `seed-visit-schedule-${visit.localUuidSuffix}`;
    const localVisitUuid = `seed-visit-instance-${visit.localUuidSuffix}`;

    const existingSchedule = await prisma.visitSchedule.findUnique({
      where: { localScheduleUuid },
    });
    const schedule =
      existingSchedule ??
      (await prisma.visitSchedule.create({
        data: {
          localScheduleUuid,
          beneficiaryId: visit.beneficiaryId,
          visitCode: `SEED-${visit.localUuidSuffix.toUpperCase()}`,
          visitType: 'ANC',
          scheduledDate: new Date('2026-08-25'),
          windowStartDate: new Date('2026-08-15'),
          windowEndDate: new Date('2026-09-05'),
          anchorType: 'REGISTRATION',
          generatedByRuleVersionId: GENERIC_RULE_VERSION_ID,
        },
      }));

    const existingInstance = await prisma.visitInstance.findUnique({ where: { localVisitUuid } });
    if (existingInstance) {
      skipped += 1;
      continue;
    }

    await prisma.visitInstance.create({
      data: {
        scheduleId: schedule.id,
        beneficiaryId: visit.beneficiaryId,
        sakhiId: visit.sakhiId,
        localVisitUuid,
        statusLookupValueId: visit.statusLookupValueId,
      },
    });
    created += 1;
  }

  return {
    step: 'supervisor-app-visits',
    created: created > 0,
    message: `Created ${created} visit instance(s), skipped ${skipped} already-seeded row(s).`,
  };
}

async function main(): Promise<void> {
  const results = [await seedForms(), await seedVisitMasters(), await seedSupervisorAppVisits()];

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
