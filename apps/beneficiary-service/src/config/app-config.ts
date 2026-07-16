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
