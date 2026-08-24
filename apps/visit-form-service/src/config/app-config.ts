import { publicBaseUrlsSchema } from '@armman/service-commons';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3003),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  PUBLIC_BASE_URLS: publicBaseUrlsSchema,
  // Base URL of the gateway to reach auth-service's geography-units endpoint
  // through (same naming/default as beneficiary-service's Health Block
  // derivation call) — NOT auth-service's own port directly, since the
  // gateway is what verifies the caller's forwarded Authorization header.
  AUTH_SERVICE_BASE_URL: z.string().url().default('http://localhost:3000'),
  // rules-service's seeded "Arogya Sakhi CCV Visit Scheduling" RuleSet id —
  // no field anywhere maps a schedule journey (like "CCV") to its ruleSetId
  // (unlike risk-grading, which uses FormDefinition.riskRuleSetId), so this
  // is configured directly. Optional: BR-13's CCV opening-risk-state
  // computation is skipped (not failed) when unset — see
  // ccvOpeningRiskState.client.ts.
  CCV_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  // Same "no scheduleKind->ruleSetId mapping exists" gap as CCV above, for
  // the other six SCHEDULE_KINDS this service can generate via
  // POST /visit-schedules/generate (generateSchedule.service.ts). Each is
  // optional — a journey with no configured ruleSetId simply isn't available
  // to /generate yet, surfaced as a 400 rather than skipped silently, since
  // (unlike CCV's risk-tier hint) a missing schedule here is not optional.
  ANC_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  PP_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  NN_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  INC_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  HR_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  DELIVERY_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
});

export type AppConfig = z.infer<typeof schema>;

/**
 * Validates `process.env` at startup and returns a typed, frozen config. Fails
 * fast (process exit) on invalid configuration so a misconfigured service never
 * starts.
 */
function loadConfig(): AppConfig {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    console.error(`Invalid environment configuration: ${issues}`);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

export const appConfig: AppConfig = loadConfig();
