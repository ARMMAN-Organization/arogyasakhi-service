import { z } from 'zod';

/**
 * Validation schema for creating a notification. `.strict()` rejects unknown fields,
 * matching the previous global ValidationPipe `forbidNonWhitelisted: true`.
 *
 * Fields are derived from the `Notification` Prisma model (see `prisma/schema.prisma`).
 * System/audit-managed fields (id, createdAt, updatedAt, isDeleted, deletedAt,
 * createdByUserId, updatedByUserId) are excluded — they are not client-supplied at
 * creation time (no auth context wired into routers yet).
 */
export const createNotificationSchema = z
  .object({
    recipientUserId: z.string().trim().min(1),
    notificationType: z.enum([
      'MISSED_VISIT_ESCALATION',
      'BENEFICIARY_TRANSFER_NOTICE',
      'REFERRAL_UPDATE',
      'REFERRAL_FOLLOWUP_DUE',
      'REFERRAL_FOLLOWUP_OVERDUE',
      'REOPEN_UPDATE',
      'CLOSURE_UPDATE',
      'LMP_CHANGE_UPDATE',
      'REFERRAL_INCOMPLETE_UPDATE',
      'ACCOMPANIED_REFERRAL_UPDATE',
      'DATA_RESTORE_UPDATE',
      'CLOSURE_REVIEW_UPDATE',
      'FORM_UPDATE',
      'DATA_SYNC_STATUS',
      'VISIT_NEAR_MISS',
      'EDD_APPROACHING',
      'EDD_OVERDUE',
      'SUPERVISOR_APPROVAL_REQUESTED',
      'SUPERVISOR_APPROVAL_DECISION',
      'APP_UPDATE_REQUIRED',
      'MEETING_REMINDER',
      'TRAINING_REMINDER',
      'MEETING_UPDATE',
      'TRAINING_UPDATE',
    ]),
    title: z.string().trim().min(1).max(180),
    body: z.string().trim().min(1).optional(),
    priority: z.number().int().default(5),
    ctaType: z.string().trim().min(1).max(80).optional(),
    linkedEntityType: z.string().trim().min(1).max(80).optional(),
    linkedEntityId: z.string().trim().min(1).optional(),
    status: z.enum(['UNREAD', 'READ', 'DISMISSED', 'EXPIRED']),
    readAt: z.coerce.date().optional(),
    dismissedAt: z.coerce.date().optional(),
  })
  .strict();

export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
