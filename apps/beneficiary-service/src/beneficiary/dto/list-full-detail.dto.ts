import { z } from 'zod';

/**
 * Query params for `GET /beneficiaries/full-detail` — FR-SV-4.6's Data
 * Restore flow (a Sakhi's device re-downloading every beneficiary case in
 * full detail after a reset/reinstall). Deliberately narrower than
 * listBeneficiariesQuerySchema — no name/mobile/geography/status filters,
 * since a full-device restore needs every in-scope case, not a filtered
 * subset; only sakhiId scoping and pagination apply.
 *
 * `sakhiId` follows the same rule as GET /beneficiaries: a SAKHI caller's
 * own id always wins regardless of this param; SUPERVISOR narrows to one
 * roster sakhiId or, if omitted, her whole roster; MANAGER/ADMIN may pass
 * any sakhiId or omit it for fully unscoped. `cursor`/`limit` match this
 * service's existing cursor-pagination convention exactly.
 */
export const listFullDetailQuerySchema = z
  .object({
    sakhiId: z.string().uuid().optional(),
    // Opaque, base64-encoded cursor — see beneficiary.repository.ts's encode/decodeCursor.
    cursor: z.string().trim().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export type ListFullDetailQueryInput = z.infer<typeof listFullDetailQuerySchema>;
