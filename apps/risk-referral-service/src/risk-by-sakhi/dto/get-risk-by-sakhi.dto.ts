import { z } from 'zod';

/**
 * Path params for `GET /risk/by-sakhi/:sakhiId`. `.strict()` rejects any
 * unexpected param, matching every other params schema in this service (see
 * beneficiary-risk/dto/get-beneficiary-risk.dto.ts).
 */
export const riskBySakhiParamsSchema = z.object({ sakhiId: z.string().uuid() }).strict();

export type RiskBySakhiParams = z.infer<typeof riskBySakhiParamsSchema>;

/**
 * `PNC` has no single agreed RiskPhase mapping anywhere else in this
 * codebase (the SRS uses it inconsistently — see riskBySakhi.service.ts's
 * PHASES_BY_TYPE comment) — fixed here as DELIVERY + PP + NN per product
 * decision.
 */
export const RISK_BY_SAKHI_TYPES = ['ANC', 'PNC'] as const;

/**
 * Query schema for `GET /risk/by-sakhi/:sakhiId?type=ANC|PNC`. `type` is
 * optional — omitting it returns risk-condition summaries across every
 * phase, unfiltered.
 */
export const riskBySakhiQuerySchema = z
  .object({ type: z.enum(RISK_BY_SAKHI_TYPES).optional() })
  .strict();

export type RiskBySakhiQuery = z.infer<typeof riskBySakhiQuerySchema>;
