import { loadConfig, publicBaseUrlsSchema } from '@armman/service-commons';
import { z } from 'zod';

/** Environment schema for this service. Validated and frozen at startup. */
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3001),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),
  DATABASE_URL: z.string().url(),
  CORS_ORIGINS: z
    .string()
    .default('')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean),
    ),
  PUBLIC_BASE_URLS: publicBaseUrlsSchema,
  // Base URL of the gateway to reach auth-service's geography-units endpoint
  // through (same naming/default as visit-form-service's backfill script) —
  // NOT auth-service's own port directly, since the gateway is what verifies
  // the caller's forwarded Authorization header.
  AUTH_SERVICE_BASE_URL: z.string().url().default('http://localhost:3000'),
  // Base URL of the gateway to reach risk-referral-service's risk-conditions
  // endpoint through, same routing pattern as AUTH_SERVICE_BASE_URL above —
  // used to resolve a BeneficiaryRiskConditionSummary row's riskConditionId
  // to a display name for GET /beneficiaries/:id.
  RISK_REFERRAL_SERVICE_BASE_URL: z.string().url().default('http://localhost:3000'),
  // Base64-encoded 32-byte keys consumed directly by @armman/service-commons'
  // pii-crypto module (encryptPii/decryptPii, hashForSearch) via process.env.
  // Validated here so the service fails fast at boot rather than at first use.
  PII_ENCRYPTION_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be a base64-encoded 32-byte key'),
  PII_SEARCH_HASH_KEY: z
    .string()
    .refine((v) => Buffer.from(v, 'base64').length === 32, 'must be a base64-encoded 32-byte key'),
});

export type AppConfig = z.infer<typeof schema>;

export const appConfig: AppConfig = loadConfig(schema);
