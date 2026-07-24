import { z } from 'zod';

const url = (fallback: string) => z.string().url().default(fallback);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
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

  // Public URL(s) the gateway is reached at, used only for the "Servers"
  // dropdown of the aggregated Swagger docs so "Try it out" targets the
  // gateway (e.g. the ngrok/staging host), not an internal service URL.
  // Comma-separated; falls back to http://localhost:$PORT in local dev.
  PUBLIC_BASE_URLS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),

  // Public half of the RS256 keypair used to sign access tokens (see
  // auth-service). Only the public key is needed here — the gateway verifies
  // tokens, it never issues them. `.env` files don't unescape literal `\n` in
  // double-quoted values, so we normalize regardless of how it arrives.
  JWT_PUBLIC_KEY: z
    .string()
    .min(1)
    .transform((v) => v.replace(/\\n/g, '\n')),

  // Downstream service base URLs. The gateway reaches every service ONLY via
  // these URLs (HTTP) — it never imports another service's code. In production
  // these become internal DNS names (e.g. http://auth-service.internal:3002).
  AUTH_SERVICE_URL: url('http://localhost:3002'),
  BENEFICIARY_SERVICE_URL: url('http://localhost:3001'),
  VISIT_FORM_SERVICE_URL: url('http://localhost:3003'),
  RULES_SERVICE_URL: url('http://localhost:3004'),
  RISK_REFERRAL_SERVICE_URL: url('http://localhost:3005'),
  CLOSURE_REOPEN_SERVICE_URL: url('http://localhost:3006'),
  APPROVAL_SERVICE_URL: url('http://localhost:3007'),
  INCENTIVE_WAGES_SERVICE_URL: url('http://localhost:3008'),
  NOTIFICATION_ESCALATION_SERVICE_URL: url('http://localhost:3009'),
  SYNC_SERVICE_URL: url('http://localhost:3010'),
  MEDIA_SERVICE_URL: url('http://localhost:3011'),
  AUDIT_SERVICE_URL: url('http://localhost:3013'),
  SUPERVISOR_OPERATIONS_SERVICE_URL: url('http://localhost:3016'),
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
