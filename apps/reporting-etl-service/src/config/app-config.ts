import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3015),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
  DATABASE_URL: z.string().url(),
  // Client-credentials identity (POST /auth/service-token) this service's
  // analytics-aggregation job authenticates as, to call audit-service's
  // SYSTEM-only GET /analytics/events. Optional: the job logs and skips its
  // run when unset, rather than failing to start over a not-yet-provisioned
  // credential — same convention as risk-referral-service's own job.
  SERVICE_ACCOUNT_CLIENT_ID: z.string().min(1).optional(),
  SERVICE_ACCOUNT_CLIENT_SECRET: z.string().min(1).optional(),
  // node-cron expression for the SRS Sec 9.9 metric-aggregation job.
  ANALYTICS_AGGREGATION_JOB_CRON: z.string().default('0 2 * * *'),
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
