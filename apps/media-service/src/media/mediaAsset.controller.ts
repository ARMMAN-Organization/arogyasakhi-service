import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { MediaAssetService } from './mediaAsset.service';
import { createMediaAssetSchema } from './dto/create-mediaAsset.dto';
import { asyncHandler, createDocumentedRouter, ok, validateBody } from '../app.module';

extendZodWithOpenApi(z);

const mediaAssetSchema = z.object({
  id: z.string().uuid(),
  assetType: z.string().openapi({ example: 'CONSENT_PHOTO' }),
  storageUri: z.string().openapi({ example: 's3://arogya-media/2026/07/consent-abc123.jpg' }),
  mimeType: z.string().openapi({ example: 'image/jpeg' }),
  sizeBytes: z
    .string()
    .openapi({
      description: 'File size in bytes (BigInt serialized as string).',
      example: '204800',
    }),
  uploadedByUserId: z.string().uuid().nullable(),
  uploadedAt: z.string().datetime(),
  linkedEntityType: z.string().nullable(),
  linkedEntityId: z.string().uuid().nullable(),
  encryptedFlag: z.boolean(),
  beneficiaryId: z.string().uuid().nullable(),
  visitId: z.string().uuid().nullable(),
  submissionId: z.string().uuid().nullable(),
  referralId: z.string().uuid().nullable(),
  followupId: z.string().uuid().nullable(),
  eventId: z.string().uuid().nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Media asset HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * is inferred from `validateBody` already in the middleware chain, so
 * `/docs.json` can never drift from what's actually mounted.
 */
export function createMediaAssetRouter(service: MediaAssetService) {
  const doc = createDocumentedRouter();

  doc.get(
    '/media',
    {
      summary: 'List media assets',
      tags: ['Media'],
      responses: {
        200: { description: 'Media assets', schema: envelope(z.array(mediaAssetSchema)) },
      },
    },
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.list()));
    }),
  );

  doc.post(
    '/media',
    {
      summary: 'Create a media asset record',
      tags: ['Media'],
      responses: {
        201: { description: 'Media asset created', schema: envelope(mediaAssetSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
      },
    },
    validateBody(createMediaAssetSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(created));
    }),
  );

  return doc;
}
