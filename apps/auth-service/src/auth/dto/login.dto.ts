import { z } from 'zod';
import { usernameSchema } from './username';

/**
 * Login is username + password for every role, per SRS FR-S-1.1 ("Sakhi must
 * authenticate using Username and password"), applied to all roles rather
 * than SAKHI only. mobileNumber remains a real `users` column (per the ERD)
 * but is no longer a login credential.
 */
export const loginSchema = z
  .object({
    username: usernameSchema,
    password: z.string().min(1),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
