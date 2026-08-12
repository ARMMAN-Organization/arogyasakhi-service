import { publicBaseUrlsSchema } from '@armman/service-commons';
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3011),
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
  S3_BUCKET_NAME: z.string().min(1),
  AWS_REGION: z.string().min(1).default('ap-south-1'),
  // Presigned PUT URL lifetime. Short-lived on purpose — an app that stalls
  // past this window must request a fresh URL rather than retry a stale one.
  PRESIGNED_URL_EXPIRY_SECONDS: z.coerce.number().int().positive().default(900),
  // 25 MB — generous for a consent photo or a scanned discharge summary
  // without letting a single upload consume disproportionate S3 spend.
  MAX_UPLOAD_SIZE_BYTES: z.coerce.number().int().positive().default(26214400),
  ALLOWED_UPLOAD_MIME_TYPES: z
    .string()
    .default('image/jpeg,image/png,image/webp,application/pdf')
    .transform((v) =>
      v
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    ),
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
