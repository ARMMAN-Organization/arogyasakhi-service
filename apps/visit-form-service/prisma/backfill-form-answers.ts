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
 * submission — re-running twice in a row produces the same end state. The
 * prior rows are soft-deleted (isDeleted/deletedAt), not hard-deleted — this
 * table exists for reporting/audit, so a run's own history stays recoverable
 * rather than being permanently erased on every reconciliation.
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
import { schemaJsonSchema, type FormField } from '../src/forms/dto/form-field.dto';

const prisma = new PrismaClient();

// Rows are processed in fixed-size concurrent batches — each row's own
// transaction is already independent, so bounded concurrency cuts run time
// on a large table without changing per-row atomicity or the summary's
// correctness (still one outcome per row, still fully awaited before the
// script exits).
const CONCURRENCY = 15;

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
 *
 * `resolvedSchema` is passed in (not re-fetched/re-parsed here) so a caller
 * processing many submissions against the same small set of form versions
 * can resolve+parse each version once and reuse it, instead of repeating
 * that DB round-trip and zod parse on every row.
 */
export async function backfillSubmission(
  client: Pick<PrismaClient, 'formAnswer'>,
  submission: { id: string; formDataJson: unknown },
  resolvedSchema: FormField[],
): Promise<{ answersWritten: number }> {
  // Arrays pass `typeof === 'object' && !== null` too — without this guard,
  // a legacy row with form_data_json stored as a JSON array would get cast
  // to Record<string, unknown> and buildFormAnswers would Object.entries()
  // its numeric indices as if they were question codes, instead of being
  // treated as unparseable.
  const formData =
    typeof submission.formDataJson === 'object' &&
    submission.formDataJson !== null &&
    !Array.isArray(submission.formDataJson)
      ? (submission.formDataJson as Record<string, unknown>)
      : {};
  const answers = buildFormAnswers(resolvedSchema, formData);

  await client.formAnswer.updateMany({
    where: { submissionId: submission.id, isDeleted: false },
    data: { isDeleted: true, deletedAt: new Date() },
  });
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

/** Splits an array into fixed-size chunks, preserving order. */
function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) chunks.push(items.slice(i, i + size));
  return chunks;
}

async function main(): Promise<void> {
  const formVersionIdArg = process.argv
    .find((a) => a.startsWith('--form-version-id='))
    ?.split('=')[1];

  const submissions = await prisma.formSubmission.findMany({
    where: formVersionIdArg ? { formVersionId: formVersionIdArg } : undefined,
    select: { id: true, formVersionId: true, formDataJson: true },
  });

  // Resolved once per distinct formVersionId, not once per submission — the
  // number of form versions touched in a run is typically far smaller than
  // the number of submissions against them.
  const resolvedSchemas = new Map<string, FormField[] | null>();
  async function resolveSchema(formVersionId: string): Promise<FormField[] | null> {
    if (resolvedSchemas.has(formVersionId)) return resolvedSchemas.get(formVersionId) ?? null;
    const version = await prisma.formVersion.findUnique({ where: { id: formVersionId } });
    if (!version) {
      resolvedSchemas.set(formVersionId, null);
      return null;
    }
    const parsed = schemaJsonSchema.safeParse(version.schemaJson);
    const resolved = parsed.success ? parsed.data : null;
    resolvedSchemas.set(formVersionId, resolved);
    return resolved;
  }

  const summary: BackfillSummary = { processed: 0, answersWritten: 0, skipped: [] };

  for (const batch of chunk(submissions, CONCURRENCY)) {
    await Promise.all(
      batch.map(async (submission) => {
        const schema = await resolveSchema(submission.formVersionId);
        if (!schema) {
          summary.processed += 1;
          summary.skipped.push({
            submissionId: submission.id,
            reason:
              resolvedSchemas.get(submission.formVersionId) === null
                ? 'form_version_id no longer resolves to a form_versions row, or its schemaJson failed to parse'
                : 'unknown',
          });
          return;
        }
        const result = await prisma.$transaction((tx) =>
          backfillSubmission(tx, submission, schema),
        );
        summary.processed += 1;
        summary.answersWritten += result.answersWritten;
      }),
    );
  }

  console.log('Backfill summary:', {
    processed: summary.processed,
    answersWritten: summary.answersWritten,
    skippedCount: summary.skipped.length,
  });
  if (summary.skipped.length > 0) {
    console.log('Skipped submissions:', summary.skipped);
    await prisma.$disconnect();
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
    .catch(async (err) => {
      console.error(err);
      // process.exit terminates synchronously before a chained .finally
      // would run — disconnect explicitly here (and on the thrown-skip path
      // above) so a failure doesn't leak the connection instead of relying
      // on a .finally that never gets to fire.
      await prisma.$disconnect();
      process.exit(1);
    })
    .then(() => prisma.$disconnect());
}
