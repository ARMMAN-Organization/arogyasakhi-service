import { createHash } from 'node:crypto';
import { PrismaClient } from '../../../node_modules/.prisma/client-visit-form-service';
import motherRegistrationPayload from './seed-data/mother-registration.json';
import childRegistrationPayload from './seed-data/child-registration.json';
import ancVisitPayload from './seed-data/anc-visit.json';
import infantVisitPayload from './seed-data/infant-visit.json';
import deliveryVisitPayload from './seed-data/delivery-visit.json';
import postpartumVisitPayload from './seed-data/postpartum-visit.json';
import neonatalVisitPayload from './seed-data/neonatal-visit.json';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

interface FormDraft {
  formCode: string;
  formName: string;
  entityType: 'MOTHER' | 'CHILD';
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

async function main(): Promise<void> {
  const results = [await seedForms()];

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
