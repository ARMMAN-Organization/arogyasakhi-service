import { z } from 'zod';

/** Caps a single lookup batch — matches list-risk-conditions.dto.ts's own cap. */
export const MAX_BATCH_PARAMETER_CODES = 100;

/**
 * Query schema for `GET /risk-parameters?parameterCode=...` — a comma
 * separated batch of parameter codes to resolve to full RiskParameter rows in
 * one round trip. `parameterCode` is optional: omitting it entirely requests
 * every ACTIVE risk parameter (a master-data download), rather than a
 * code-filtered batch lookup. Kept as a plain string + `.refine()` (not
 * `z.coerce.*`), matching list-risk-conditions.dto.ts's own note on why —
 * zod-to-openapi cannot introspect a `ZodEffects`-wrapped transform and
 * crashes OpenAPI doc generation at startup.
 */
export const listRiskParametersQuerySchema = z
  .object({
    parameterCode: z
      .string()
      .trim()
      .min(1)
      .refine((v) => v.split(',').length <= MAX_BATCH_PARAMETER_CODES, {
        message: `parameterCode: must be a comma-separated list of at most ${MAX_BATCH_PARAMETER_CODES} codes`,
      })
      .optional(),
  })
  .strict();

export type ListRiskParametersQuery = z.infer<typeof listRiskParametersQuerySchema>;
