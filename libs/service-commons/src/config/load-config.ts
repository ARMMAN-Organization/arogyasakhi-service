import { z } from 'zod';

/**
 * Validates `process.env` against a Zod schema at startup and returns a typed,
 * frozen config object. Fails fast (process exit) on invalid configuration so a
 * misconfigured service never starts.
 */
export function loadConfig<TSchema extends z.ZodTypeAny>(schema: TSchema): z.infer<TSchema> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    console.error(`Invalid environment configuration: ${issues}`);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}

/**
 * Comma-separated public URLs a service is reachable at per environment
 * (e.g. "https://staging-api.example.com,https://api.example.com"), listed
 * in the Swagger "Servers" dropdown. Empty in local dev, where the docs
 * fall back to `http://localhost:$PORT`. Share this in every service's
 * `app-config.ts` schema instead of repeating the split/trim/filter transform.
 */
export const publicBaseUrlsSchema = z
  .string()
  .default('')
  .transform((v) =>
    v
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  );
