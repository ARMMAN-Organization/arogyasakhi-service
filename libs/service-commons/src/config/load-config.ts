import { Logger } from '@nestjs/common';
import type { z } from 'zod';

/**
 * Validates `process.env` against a Zod schema at startup and returns a typed,
 * frozen config object. Fails fast (process exit) on invalid configuration so a
 * misconfigured service never starts.
 */
export function loadConfig<TSchema extends z.ZodTypeAny>(schema: TSchema): z.infer<TSchema> {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    new Logger('Config').error(`Invalid environment configuration: ${issues}`);
    process.exit(1);
  }
  return Object.freeze(parsed.data);
}
