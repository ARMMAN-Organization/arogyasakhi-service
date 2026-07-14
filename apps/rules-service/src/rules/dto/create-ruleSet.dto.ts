import { z } from 'zod';

/**
 * Validation schema for creating a rule set. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 */
export const createRuleSetSchema = z
  .object({
    ruleCategory: z.enum([
      'SCHEDULE',
      'RISK',
      'ESCALATION',
      'INCENTIVE',
      'CLOSURE',
      'NOTIFICATION',
    ]),
    ruleSetName: z.string().trim().min(1).max(160),
    status: z.enum(['DRAFT', 'ACTIVE', 'RETIRED']).default('DRAFT'),
  })
  .strict();

export type CreateRuleSetInput = z.infer<typeof createRuleSetSchema>;
