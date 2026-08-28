import { z } from 'zod';

/**
 * Validation schema for PATCH /notifications/:id. Only READ/DISMISSED are
 * client-settable transitions — UNREAD is the creation default and EXPIRED
 * is system-managed, neither is a valid target of a caller-initiated update.
 */
export const updateNotificationStatusSchema = z
  .object({
    status: z.enum(['READ', 'DISMISSED']),
  })
  .strict();

export type UpdateNotificationStatusInput = z.infer<typeof updateNotificationStatusSchema>;
