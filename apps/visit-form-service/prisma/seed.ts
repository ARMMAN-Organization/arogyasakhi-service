import { createHash } from 'node:crypto';
import { PrismaClient } from '../../../node_modules/.prisma/client-visit-form-service';

const prisma = new PrismaClient();

interface SeedResult {
  step: string;
  created: boolean;
  message: string;
}

/** Same checksum computation as FormService — sha256 over the schema JSON. */
function computeChecksum(schemaJson: unknown): Buffer {
  return createHash('sha256').update(JSON.stringify(schemaJson)).digest();
}

/**
 * One entry in form_versions.schema_json — mirrors formFieldSchema in
 * src/forms/dto/form-field.dto.ts. Only the keys that schema actually
 * validates are used here.
 */
interface SeedField {
  question_code: string;
  label: string;
  input_type: string;
  required: boolean;
  lookup_category_code?: string;
  computedFrom?: string;
}

/**
 * Form master data — the registration forms defined by the ERD's
 * form_definitions master list (form_code MOTHER_REGISTRATION /
 * CHILD_REGISTRATION). Field lists come from SRS §7.x "PW Registration
 * Form" / "Infant Registration Form" (line 425-427). Computed fields
 * (EDD) carry `computedFrom` so they are not manually entered. Dropdown
 * fields carry `lookup_category_code` pointing at auth-service's lookup
 * categories (SEX, PHONE_OWNER seeded there).
 *
 * This is real master data required in every environment for the dynamic
 * enrollment form to render — not test data. Seeded as a single PUBLISHED
 * v1 so `GET /forms/:formCode/active-version` returns immediately.
 */
const FORMS: {
  formCode: string;
  formName: string;
  entityType: 'MOTHER' | 'CHILD';
  fields: SeedField[];
}[] = [
  {
    formCode: 'MOTHER_REGISTRATION',
    formName: 'Pregnant Woman Registration',
    entityType: 'MOTHER',
    fields: [
      { question_code: 'lmp_date', label: 'LMP date', input_type: 'date', required: true },
      {
        question_code: 'edd_date',
        label: 'EDD',
        input_type: 'date',
        required: false,
        computedFrom: 'EDD_FROM_LMP',
      },
      {
        question_code: 'beneficiary_address',
        label: 'Beneficiary address',
        input_type: 'text',
        required: false,
      },
      {
        question_code: 'mobile_number',
        label: 'Mobile number',
        input_type: 'text',
        required: false,
      },
      {
        question_code: 'phone_owner',
        label: 'Phone owner',
        input_type: 'select',
        required: false,
        lookup_category_code: 'PHONE_OWNER',
      },
      { question_code: 'gravida', label: 'Gravida', input_type: 'number', required: false },
      { question_code: 'para', label: 'Para', input_type: 'number', required: false },
      {
        question_code: 'living_children',
        label: 'Living children',
        input_type: 'number',
        required: false,
      },
      { question_code: 'abortions', label: 'Abortions', input_type: 'number', required: false },
      { question_code: 'stillbirths', label: 'Stillbirths', input_type: 'number', required: false },
      {
        question_code: 'dead_children',
        label: 'Dead children',
        input_type: 'number',
        required: false,
      },
      {
        question_code: 'sickle_cell_status',
        label: 'Sickle Cell status',
        input_type: 'text',
        required: false,
      },
    ],
  },
  {
    formCode: 'CHILD_REGISTRATION',
    formName: 'Infant Registration',
    entityType: 'CHILD',
    fields: [
      {
        question_code: 'caregiver_name',
        label: 'Caregiver name',
        input_type: 'text',
        required: true,
      },
      {
        question_code: 'mother_date_of_birth',
        label: 'Mother date of birth',
        input_type: 'date',
        required: false,
      },
      {
        question_code: 'beneficiary_address',
        label: 'Beneficiary address',
        input_type: 'text',
        required: false,
      },
      {
        question_code: 'mobile_number',
        label: 'Mobile number',
        input_type: 'text',
        required: false,
      },
      {
        question_code: 'phone_owner',
        label: 'Phone owner',
        input_type: 'select',
        required: false,
        lookup_category_code: 'PHONE_OWNER',
      },
      {
        question_code: 'child_birth_length',
        label: 'Child birth length',
        input_type: 'number',
        required: false,
      },
      {
        question_code: 'child_birth_weight',
        label: 'Child birth weight',
        input_type: 'number',
        required: false,
      },
      {
        question_code: 'current_length_at_registration',
        label: 'Current length at registration',
        input_type: 'number',
        required: false,
      },
      {
        question_code: 'current_weight_at_registration',
        label: 'Current weight at registration',
        input_type: 'number',
        required: false,
      },
    ],
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
            versionNo: 'v1',
            schemaJson: form.fields as never,
            validationJson: [] as never,
            checksum: computeChecksum(form.fields),
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
    message: `Seeded ${createdDefs} registration form definition(s) with a published v1.`,
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
