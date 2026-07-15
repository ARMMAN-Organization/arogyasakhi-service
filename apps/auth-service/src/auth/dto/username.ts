import { z } from 'zod';

/**
 * Login identifier for every role, per SRS FR-S-1.1. Restricted to safe
 * characters (letters, digits, dot, underscore, hyphen) — unrestricted input
 * allows spaces, `@`, `#`, and other characters that cause lookup/display
 * edge cases.
 */
export const usernameSchema = z
  .string()
  .trim()
  .min(1)
  .max(50)
  .regex(/^[a-zA-Z0-9._-]+$/, 'username may only contain letters, digits, dot, underscore, hyphen');
