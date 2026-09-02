import { z } from 'zod';

/**
 * Client-credentials exchange for a machine identity — the counterpart to
 * `loginSchema` for automated jobs/crons instead of a human. `clientId` is
 * not a secret (it identifies which service account); `clientSecret` is.
 */
export const serviceTokenSchema = z
  .object({
    clientId: z.string().min(1),
    clientSecret: z.string().min(1),
  })
  .strict();

export type ServiceTokenInput = z.infer<typeof serviceTokenSchema>;
