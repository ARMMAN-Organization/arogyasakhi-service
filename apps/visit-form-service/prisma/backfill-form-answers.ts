/**
 * Backfill/reconciliation for form_answers.
 *
 * form_submissions.form_data_json is the durable source of truth; form_answers
 * is a normalized projection of it (see FormRepository.createSubmission),
 * written in the same transaction as the submission at request time. This
 * script exists for the case where that projection logic changes later (a new
 * input_type, a fix to buildFormAnswers) and needs to be re-applied to
 * submissions that were stored under the old logic — it never touches
 * form_data_json itself.
 *
 * Idempotent: for each submission processed, this replaces (not appends to)
 * its form_answers rows with a fresh decomposition, in one transaction per
 * submission — re-running twice in a row produces the same end state.
 *
 * Usage:
 *   npx ts-node prisma/backfill-form-answers.ts [--form-version-id=<uuid>]
 *
 * With no flag, every form_submissions row is reprocessed. With
 * --form-version-id, only submissions on that exact form version are touched
 * — useful for re-applying a fix scoped to one form's schema without
 * reprocessing the whole table.
 */
import { PrismaClient } from '../../../node_modules/.prisma/client-visit-form-service';
import { buildFormAnswers } from '../src/forms/form.mapper';
import { schemaJsonSchema } from '../src/forms/dto/form-field.dto';

const prisma = new PrismaClient();

export interface BackfillSummary {
  processed: number;
  answersWritten: number;
  skipped: Array<{ submissionId: string; reason: string }>;
}

/**
 * Re-derives and replaces one submission's form_answers rows from its stored
 * form_data_json, using the schema of the form version it was actually
 * answered against (never the currently active version) — same "own
 * historical schema" contract createSubmission relies on. Returns
 * `{ skipped }` (and leaves existing form_answers untouched) when the version
 * can't be resolved/parsed, rather than guessing or dropping good data.
 */
export async function backfillSubmission(
  client: Pick<PrismaClient, 'formVersion' | 'formAnswer'>,
  submission: { id: string; formVersionId: string; formDataJson: unknown },
): Promise<{ answersWritten: number } | { skipped: string }> {
  const version = await client.formVersion.findUnique({ where: { id: submission.formVersionId } });
  if (!version) return { skipped: 'form_version_id no longer resolves to a form_versions row' };

  const parsed = schemaJsonSchema.safeParse(version.schemaJson);
  if (!parsed.success) {
    return { skipped: 'schemaJson failed to parse against the current field schema' };
  }

  const formData =
    typeof submission.formDataJson === 'object' && submission.formDataJson !== null
      ? (submission.formDataJson as Record<string, unknown>)
      : {};
  const answers = buildFormAnswers(parsed.data, formData);

  await client.formAnswer.deleteMany({ where: { submissionId: submission.id } });
  if (answers.length) {
    await client.formAnswer.createMany({
      data: answers.map((a) => ({
        submissionId: submission.id,
        fieldCode: a.fieldCode,
        answerValueText: a.answerValueText,
        answerValueNumber: a.answerValueNumber,
        answerValueDate: a.answerValueDate,
        answerValueBool: a.answerValueBool,
        answerValueJson: a.answerValueJson as never,
        isIndexed: a.isIndexed,
      })),
    });
  }

  return { answersWritten: answers.length };
}

async function main(): Promise<void> {
  const formVersionIdArg = process.argv
    .find((a) => a.startsWith('--form-version-id='))
    ?.split('=')[1];

  const submissions = await prisma.formSubmission.findMany({
    where: formVersionIdArg ? { formVersionId: formVersionIdArg } : undefined,
    select: { id: true, formVersionId: true, formDataJson: true },
  });

  const summary: BackfillSummary = { processed: 0, answersWritten: 0, skipped: [] };

  for (const submission of submissions) {
    const result = await prisma.$transaction((tx) => backfillSubmission(tx, submission));
    summary.processed += 1;
    if ('skipped' in result) {
      summary.skipped.push({ submissionId: submission.id, reason: result.skipped });
    } else {
      summary.answersWritten += result.answersWritten;
    }
  }

  console.log('Backfill summary:', {
    processed: summary.processed,
    answersWritten: summary.answersWritten,
    skippedCount: summary.skipped.length,
  });
  if (summary.skipped.length > 0) {
    console.log('Skipped submissions:', summary.skipped);
    throw new Error(
      `${summary.skipped.length} submission(s) could not be reprocessed — see the list above.`,
    );
  }
  console.log('Done — form_answers reprocessed for all matching submissions.');
}

// Guarded so importing backfillSubmission for a unit test (see
// backfill-form-answers.spec.ts) never opens a real Prisma connection —
// only running this file directly as a script does.
if (require.main === module) {
  main()
    .catch((err) => {
      console.error(err);
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
