import { badRequest } from '@armman/service-commons';
import { z } from 'zod';

/**
 * Path params for `GET /escalations/by-sakhi/:sakhiId`. `.strict()` rejects
 * any unexpected param, matching every other params schema in this service.
 */
export const escalationsBySakhiParamsSchema = z.object({ sakhiId: z.string().uuid() }).strict();

export type EscalationsBySakhiParams = z.infer<typeof escalationsBySakhiParamsSchema>;

/** The only two EscalationType values this endpoint surfaces — "pending form" cards. */
export const ESCALATIONS_BY_SAKHI_TYPES = ['CLOSURE_PENDING', 'DELIVERY_FORM_PENDING'] as const;

export type EscalationsBySakhiType = (typeof ESCALATIONS_BY_SAKHI_TYPES)[number];

/**
 * Query schema for `GET /escalations/by-sakhi/:sakhiId?type=...`. `type` is
 * kept as a plain string (not `.transform()`ed) — `createDocumentedRouter()`
 * cannot introspect a ZodEffects/ZodPipeline as an OpenAPI parameter object
 * (see auth-service's get-master-data-deltas.dto.ts and beneficiary-service's
 * by-ids-with-risk-query.dto.ts for the same constraint). The comma-split
 * happens in `parseEscalationTypesParam` below, called from the controller.
 */
export const escalationsBySakhiQuerySchema = z.object({ type: z.string().trim().min(1) }).strict();

export type EscalationsBySakhiQuery = z.infer<typeof escalationsBySakhiQuerySchema>;

/**
 * Splits the comma-separated `type` query param into a validated array,
 * matching beneficiary-service's `parseIdsParam` convention. Throws 400 on
 * any value outside ESCALATIONS_BY_SAKHI_TYPES rather than silently
 * dropping it — an unrecognized type is a caller error, not a filter to
 * ignore.
 */
export function parseEscalationTypesParam(type: string): EscalationsBySakhiType[] {
  const values = type
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const invalid = values.filter(
    (v) => !ESCALATIONS_BY_SAKHI_TYPES.includes(v as EscalationsBySakhiType),
  );
  if (invalid.length > 0) {
    throw badRequest(
      `type: Invalid value(s): ${invalid.join(', ')}. Must be one of ${ESCALATIONS_BY_SAKHI_TYPES.join(', ')}.`,
    );
  }

  return values as EscalationsBySakhiType[];
}
