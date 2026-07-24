import { createHash } from 'node:crypto';
import { PrismaClient } from '../../../node_modules/.prisma/client-visit-form-service';
import { REGISTRATION_FORMS } from '../src/forms/registration-forms.seed-data';

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

async function seedForms(): Promise<SeedResult> {
  let createdDefs = 0;

  for (const form of REGISTRATION_FORMS) {
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
