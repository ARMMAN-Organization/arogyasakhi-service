import { publicBaseUrlsSchema } from '@armman/service-commons';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3002),
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
  // RS256 keypair (PEM). Local keypair today; swappable for AWS KMS later behind
  // the TokenSigner interface without changing any call site. `.env` files
  // typically don't unescape literal `\n` in double-quoted values, so we
  // normalize here regardless of how the value arrives.
  JWT_PRIVATE_KEY: z
    .string()
    .min(1)
    .transform((v) => v.replace(/\\n/g, '\n')),
  JWT_PUBLIC_KEY: z
    .string()
    .min(1)
    .transform((v) => v.replace(/\\n/g, '\n')),
  REDIS_URL: z.string().url(),
  // jose "expiresIn" style duration, e.g. "15m". Access tokens have no
  // expiry by default (see AuthService.issueTokens) — this applies ONLY to
  // ADMIN-role logins, the one role that still gets a time-based expiry.
  JWT_ADMIN_ACCESS_TOKEN_TTL: z.string().default('15m'),
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
