import { z } from 'zod';

/**
 * Request body for `PATCH /health-education/messages/:id` — ADMIN-only
 * content edit. Deliberately scoped to the authoring/content fields only
 * (titleEn/bodyEn/bodyMarathi/mediaType/mediaFile). riskConditionId,
 * conditionLabel, stage, messageOrder, and sortOrder are NOT editable here:
 * conditionLabel+stage+messageOrder form the unique key prisma/seed.ts
 * upserts on, and risk-referral-service resolves education content by
 * conditionLabel/riskConditionId — a stray edit to any of those could
 * silently collide with another row's unique key or detach a message from
 * the condition it's meant to back. All fields optional (partial update);
 * an empty body is a valid no-op.
 */
export const patchHealthEducationMessageSchema = z
  .object({
    titleEn: z.string().trim().min(1).nullable().optional(),
    bodyEn: z.string().trim().min(1).optional(),
    bodyMarathi: z.string().trim().min(1).optional(),
    mediaType: z.enum(['TEXT', 'IMAGE', 'AUDIO', 'VIDEO']).optional(),
    mediaFile: z.string().trim().min(1).nullable().optional(),
  })
  .strict();

export type PatchHealthEducationMessageInput = z.infer<typeof patchHealthEducationMessageSchema>;
