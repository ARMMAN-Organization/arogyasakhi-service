import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';

extendZodWithOpenApi(z);

/** Recursive JSON value type usable inside nested objects/arrays (nulls allowed here). */
type NestedJsonValue =
  string | number | boolean | null | NestedJsonValue[] | { [key: string]: NestedJsonValue };

const nestedJsonValueSchema: z.ZodType<NestedJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(nestedJsonValueSchema),
    z.record(nestedJsonValueSchema),
  ]),
);

/**
 * Top-level JSON value schema for one edit's `value` — mirrors audit-service's
 * own `jsonValueSchema` (create-auditLog.dto.ts) so an edited value's shape is
 * never wider than what an audit entry can actually record. Unlike a nested
 * position, a top-level value does not accept a bare `null` here either —
 * matching Prisma's `InputJsonValue`, since a null answer is expressed by
 * simply omitting that field's edit, not by sending `value: null`.
 */
const jsonValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(nestedJsonValueSchema),
  z.record(nestedJsonValueSchema),
]);

/**
 * Body for `PATCH /form-submissions/:id/answers`. Every `fieldCode` must be
 * both a real question_code on the submission's own form version AND
 * allowlisted for that form code (see form-answer-edit-allowlist.ts) — the
 * whole request is rejected (all-or-nothing) if any edit fails either check;
 * see FormService.updateSubmissionAnswers.
 */
export const patchFormSubmissionAnswersSchema = z
  .object({
    edits: z
      .array(
        z
          .object({
            fieldCode: z.string().trim().min(1),
            value: jsonValueSchema,
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export type PatchFormSubmissionAnswersInput = z.infer<typeof patchFormSubmissionAnswersSchema>;
