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
            // zod-to-openapi cannot introspect a raw z.lazy() (the recursive
            // nestedJsonValueSchema inside jsonValueSchema) — it throws
            // UnknownZodTypeError at service boot the moment this schema is
            // registered on a DocumentedRouter, taking down the whole
            // service. Annotated directly here (audit-service's identical
            // jsonValueSchema instead overrides this at the route
            // registration — either works; this keeps the fix next to the
            // schema it belongs to rather than relying on every caller to
            // remember it).
            value: jsonValueSchema.openapi({ type: 'object', example: {} }),
          })
          .strict(),
      )
      .min(1)
      .max(20),
    // Idempotency key for this Sakhi-facing sync write's own downstream
    // FORM_ANSWER_EDIT audit-log call — a dropped-connection retry of this
    // PATCH resubmits the same client-generated value, so audit-service's
    // own localAuditUuid replay logic returns the original entry instead of
    // writing a second audit row for the same logical edit (security
    // review finding, 2026-09-02 — this was the third mobile-sync write in
    // this codebase without an idempotency key, unlike
    // localRequestUuid/localReopenRequestUuid/localAuditUuid elsewhere).
    // Optional since the underlying formDataJson/FormAnswer write is itself
    // idempotent for identical values — only the audit-log side effect
    // needed one.
    localAuditUuid: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export type PatchFormSubmissionAnswersInput = z.infer<typeof patchFormSubmissionAnswersSchema>;
