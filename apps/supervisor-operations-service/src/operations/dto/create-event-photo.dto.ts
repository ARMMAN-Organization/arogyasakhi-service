import { z } from 'zod';

/**
 * Validation schema for adding a photo to an event's gallery
 * (event_photos) — additive to, not a replacement for, the event's single
 * mandatory `photoMediaId` completion photo. `.strict()` rejects unknown
 * fields, matching the repo-wide convention.
 */
export const createEventPhotoSchema = z
  .object({
    mediaId: z.string().uuid(),
  })
  .strict();

export type CreateEventPhotoInput = z.infer<typeof createEventPhotoSchema>;
