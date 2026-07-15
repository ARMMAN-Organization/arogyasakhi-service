import { z } from 'zod';

/** Indian mobile number in normalized E.164-like format, e.g. +919876543210. */
export const mobileNumberSchema = z
  .string()
  .regex(/^\+91\d{10}$/, 'mobileNumber must be in the format +91XXXXXXXXXX');
