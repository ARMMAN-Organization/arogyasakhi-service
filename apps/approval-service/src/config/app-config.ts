import { publicBaseUrlsSchema } from '@armman/service-commons';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3007),
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
  // Base URLs of the services Quick Response merges/delegates to (same
  // naming/default pattern as supervisor-operations-service's SakhiClient) —
  // resolving APPROVAL_STATUS lookup values (auth-service), fetching
  // escalation-sourced cards (notification-escalation-service), deciding
  // REOPEN cards (closure-reopen-service), and writing the audit entry
  // (audit-service).
  AUTH_SERVICE_BASE_URL: z.string().url().default('http://localhost:3000'),
  NOTIFICATION_ESCALATION_SERVICE_BASE_URL: z.string().url().default('http://localhost:3009'),
  CLOSURE_REOPEN_SERVICE_BASE_URL: z.string().url().default('http://localhost:3006'),
  AUDIT_SERVICE_BASE_URL: z.string().url().default('http://localhost:3013'),
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
