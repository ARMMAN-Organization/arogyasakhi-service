import { publicBaseUrlsSchema } from '@armman/service-commons';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3010),
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
  // Client-credentials identity (POST /auth/service-token) this service
  // authenticates as, to call the ADMIN/SYSTEM-only POST /escalation-events
  // from GET /sync/last-synced/by-roster's read-time SYNC_DELAY check.
  // Optional: that check is skipped (roster data is still returned) when
  // unset, rather than failing the whole read over a not-yet-provisioned
  // credential.
  SERVICE_ACCOUNT_CLIENT_ID: z.string().min(1).optional(),
  SERVICE_ACCOUNT_CLIENT_SECRET: z.string().min(1).optional(),
  // How many hours since the last COMPLETED sync before a roster member is
  // flagged SYNC_DELAY. A plain env var for now, not a GoRules rule pack —
  // unlike the clinical/visit-scheduling thresholds this repo's other rule
  // packs encode, this is a single operational number with no
  // visitFamily-style branching, and evaluating it via a rules-service round
  // trip on every dashboard read adds latency this check doesn't need.
  // Revisit if this ever needs per-project/per-geography variation.
  SYNC_DELAY_THRESHOLD_HOURS: z.coerce.number().positive().default(48),
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
