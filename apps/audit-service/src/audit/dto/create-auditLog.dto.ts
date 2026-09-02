import { z } from 'zod';

/** Recursive JSON value type usable inside nested objects/arrays (nulls allowed here). */
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
 * Top-level JSON value schema matching Prisma's `InputJsonValue`, which — unlike
 * nested positions — does not accept a bare `null` (use `NullableJsonNullValueInput`
 * for that, not needed here since the field is simply omitted when absent).
 */
const jsonValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(nestedJsonValueSchema),
  z.record(nestedJsonValueSchema),
]);

/**
 * Validation schema for creating an audit log entry. `.strict()` rejects unknown
 * fields, matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 *
 * `actorUserId` and `deviceId` would normally be derived from auth/device context
 * rather than the request body, but no auth context is wired into routers yet, so
 * they are accepted as optional client-suppliable fields here (they are also
 * nullable in the Prisma schema).
 */
export const createAuditLogSchema = z
  .object({
    actorUserId: z.string().trim().min(1).optional(),
    action: z.string().trim().min(1).max(120),
    entityType: z.string().trim().min(1).max(80),
    entityId: z.string().trim().min(1).optional(),
    beforeJson: jsonValueSchema.optional(),
    afterJson: jsonValueSchema.optional(),
    ipAddress: z.string().trim().min(1).max(45).optional(),
    deviceId: z.string().trim().min(1).optional(),
    // Idempotency key for mobile-originated, offline-first callers (e.g. a
    // Sakhi's LMP change / form answer edit decision synced with retries) —
    // a dropped-connection retry resubmits the same client-generated value.
    // Optional since ADMIN/SUPERVISOR callers don't need one.
    localAuditUuid: z.string().trim().min(1).max(80).optional(),
  })
  .strict();

export type CreateAuditLogInput = z.infer<typeof createAuditLogSchema>;
