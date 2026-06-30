import { loadConfig } from '@armman/service-commons';
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
    .transform((value) => value.split(',').map((origin) => origin.trim()).filter(Boolean)),
});

export type AppConfig = z.infer<typeof schema>;

export const appConfig: AppConfig = loadConfig(schema);
