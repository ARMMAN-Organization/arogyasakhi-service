import { z } from 'zod';

/**
 * Query schema for `GET /master-data/deltas`. `since` is an optional
 * ISO-8601 timestamp — omitted means "full snapshot," matching a client's
 * first sync / cold start. An empty string is normalized to "omitted" by
 * the controller before this schema runs (see master-data.controller.ts),
 * not here — see the note below on why.
 *
 * Deliberately NOT `z.string().datetime().optional().transform(...).pipe(...)`
 * — zod-to-openapi cannot introspect a `ZodPipeline`/`ZodEffects` chain (same
 * class of issue as z.lazy()/z.instanceof()/z.coerce.bigint() elsewhere in
 * this repo) and crashes OpenAPI doc generation at startup. A plain
 * `z.string().optional()` with a `.refine()` for format validation keeps the
 * underlying ZodOptional<ZodString> shape zod-to-openapi already knows how
 * to render.
 */
export const getMasterDataDeltasQuerySchema = z
  .object({
    since: z
      .string()
      .trim()
      .optional()
      .refine((v) => !v || !Number.isNaN(Date.parse(v)), {
        message: 'since: Invalid datetime',
      }),
  })
  .strict();

export type GetMasterDataDeltasQuery = z.infer<typeof getMasterDataDeltasQuerySchema>;
