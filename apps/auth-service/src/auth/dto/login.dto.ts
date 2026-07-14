import { z } from 'zod';

/** Indian mobile number in normalized E.164-like format, e.g. +919876543210. */
const mobileNumberSchema = z
  .string()
  .regex(/^\+91\d{10}$/, 'mobileNumber must be in the format +91XXXXXXXXXX');

export const loginSchema = z
  .object({
    mobileNumber: mobileNumberSchema,
    password: z.string().min(1),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
