import { publicBaseUrlsSchema } from '@armman/service-commons';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3005),
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
  // Client-credentials identity (POST /auth/service-token) this service's
  // overdue-follow-up job authenticates as, to call the ADMIN/SYSTEM-only
  // POST /escalation-events and POST /notifications. Optional: the job logs
  // and skips its run when unset, rather than failing to start over a
  // not-yet-provisioned credential.
  SERVICE_ACCOUNT_CLIENT_ID: z.string().min(1).optional(),
  SERVICE_ACCOUNT_CLIENT_SECRET: z.string().min(1).optional(),
  // node-cron expression for the overdue-follow-up escalation job.
  OVERDUE_FOLLOWUP_JOB_CRON: z.string().default('0 6 * * *'),
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
