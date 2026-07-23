import { z } from 'zod';

/**
 * Recursive JSON value type usable inside the `topicsJson` payload (nulls allowed
 * in nested positions).
 */
type NestedJsonValue =
  string | number | boolean | null | NestedJsonValue[] | { [key: string]: NestedJsonValue };

const nestedJsonValueSchema: z.ZodType<NestedJsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(nestedJsonValueSchema),
    z.record(nestedJsonValueSchema),
  ]),
);

/**
 * Top-level JSON value schema matching Prisma's `InputJsonValue` (no bare `null`
 * at the top level — the column is non-nullable and always supplied).
 */
const jsonValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(nestedJsonValueSchema),
  z.record(nestedJsonValueSchema),
]);

/**
 * Validation schema for creating a supervisor event (meeting/training). `.strict()`
 * rejects unknown fields, matching the repo-wide `forbidNonWhitelisted` behavior.
 * `photoMediaId` is application-mandatory when `status = COMPLETED` (ERD §4.7) —
 * enforced in the service layer, not here, so the API contract stays declarative.
 */
export const createSupervisorEventSchema = z
  .object({
    projectId: z.string().uuid(),
    supervisorId: z.string().uuid(),
    eventType: z.enum(['MEETING', 'TRAINING']),
    eventDate: z.coerce.date(),
    topicsJson: jsonValueSchema,
    remarks: z.string().trim().min(1).optional(),
    status: z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED']),
    photoMediaId: z.string().uuid().optional(),
  })
  .strict();

export type CreateSupervisorEventInput = z.infer<typeof createSupervisorEventSchema>;
