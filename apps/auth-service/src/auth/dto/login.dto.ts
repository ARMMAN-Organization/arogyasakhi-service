import { z } from 'zod';
import { mobileNumberSchema } from './mobile-number';

export const loginSchema = z
  .object({
    mobileNumber: mobileNumberSchema,
    password: z.string().min(1),
  })
  .strict();

export type LoginInput = z.infer<typeof loginSchema>;
