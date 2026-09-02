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
  // rules-service's rule_sets.rule_set_id — no cross-service relation
  // (forklift rule), so these are the fixed ids rules-service's own seed.ts
  // assigns its RISK_RULE_PACKS entries. Omitted for every formCode with no
  // corresponding RiskCondition.phase rule pack in code today
  // (REGISTRATION/DELIVERY/PP) — wiring one of those would pass createSubmission's
  // FORM_CODE_TO_RISK_PHASE guard but the rule pack itself doesn't exist,
  // failing every submission (see form.service.ts's guard comment).
  riskRuleSetId?: string;
}

// Must match rules-service/prisma/seed.ts's RISK_RULE_PACKS fixed ids exactly.
const ANC_RISK_RULE_SET_ID = '55555555-5555-4555-8555-555555555551';
const INFANT_RISK_RULE_SET_ID = '55555555-5555-4555-8555-555555555561';

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
    riskRuleSetId: ANC_RISK_RULE_SET_ID,
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
    riskRuleSetId: INFANT_RISK_RULE_SET_ID,
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
    riskRuleSetId: INFANT_RISK_RULE_SET_ID,
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
    riskRuleSetId: INFANT_RISK_RULE_SET_ID,
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
        riskRuleSetId: form.riskRuleSetId ?? null,
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

async function main(): Promise<void> {
  const results = [await seedForms(), await seedVisitMasters()];

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
