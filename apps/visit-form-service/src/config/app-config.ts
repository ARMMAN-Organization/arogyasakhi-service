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
  // POST /visit-schedules/generate (visitSchedule.service.ts's
  // generateSchedule()). Each is optional — a journey with no configured
  // ruleSetId simply isn't available to /generate yet, surfaced as a 400
  // rather than skipped silently, since (unlike CCV's risk-tier hint) a
  // missing schedule here is not optional.
  ANC_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  PP_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  NN_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  INC_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  HR_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  DELIVERY_SCHEDULE_RULE_SET_ID: z.string().uuid().optional(),
  // rules-service's seeded ESCALATION RuleSet id (SRS §3A.2.7 FR-S-7.1) —
  // one rule set handles every visitFamily (see escalationEvaluator.ts), so
  // this is a single id, unlike the per-family *_SCHEDULE_RULE_SET_ID vars
  // above. Optional: the missed-visit job logs and skips escalation
  // evaluation (still transitions OPEN->MISSED) when unset, rather than
  // failing the whole job over a not-yet-provisioned rule set.
  ESCALATION_RULE_SET_ID: z.string().uuid().optional(),
  // Client-credentials identity (POST /auth/service-token) this service's
  // missed-visit job authenticates as, to call the ADMIN/SYSTEM-only
  // POST /escalation-events and POST /notifications. Optional: the job logs
  // and skips escalation/notification calls (still transitions OPEN->MISSED)
  // when unset, matching this repo's "config not yet provisioned" stance
  // elsewhere (e.g. SES_FROM_ADDRESS in auth-service) rather than failing to
  // start over a not-yet-provisioned credential.
  SERVICE_ACCOUNT_CLIENT_ID: z.string().min(1).optional(),
  SERVICE_ACCOUNT_CLIENT_SECRET: z.string().min(1).optional(),
  // node-cron expression for the missed-visit auto-transition/escalation job.
  MISSED_VISIT_JOB_CRON: z.string().default('*/30 * * * *'),
  // node-cron expression for the post-EDD visit-generation job (SR-ANC-01/
  // BR-08's EDD+7 delivery-form check) — a date-boundary check, not a
  // fine-grained event, so this defaults to once daily rather than
  // MISSED_VISIT_JOB_CRON's 30-minute cadence.
  POST_EDD_VISIT_JOB_CRON: z.string().default('0 2 * * *'),
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
