import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { MediaAssetService } from './mediaAsset.service';
import { createMediaAssetController } from './mediaAsset.controller';
import { createMediaAssetSchema } from './dto/create-mediaAsset.dto';
import { createUploadUrlSchema } from './dto/create-upload-url.dto';
import {
  requireRoles,
  trustGatewayIdentity,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

extendZodWithOpenApi(z);

// Documentation-only view of the request body (passed via `doc.post`'s
// `body` option, not to `validateBody`): annotates `s3Key` with an example
// for Swagger UI. `validateBody` below still runs the real schema.
const createMediaAssetDocSchema = createMediaAssetSchema.extend({
  s3Key: z.string().openapi({
    example: 'consent_photo/8f14e45f-ceea-467e-bd97-13a3f4d7747e',
    description: 'The key returned by POST /media/upload-url after a successful S3 upload.',
  }),
  expectedSizeBytes: z.number().openapi({
    example: 204800,
    description: 'The same sizeBytes originally declared to POST /media/upload-url.',
  }),
});

// Documentation-only view of the upload-url request body — see note above
// on `createMediaAssetDocSchema` for why a plain-annotated copy is used
// instead of `.openapi()` directly on the real schema.
const createUploadUrlDocSchema = createUploadUrlSchema.extend({
  mimeType: z.string().openapi({ example: 'image/jpeg' }),
  sizeBytes: z.number().openapi({ example: 204800 }),
});

const uploadUrlResponseSchema = z.object({
  uploadUrl: z.string().openapi({
    description: 'Presigned S3 PUT URL. Upload the file directly to this URL.',
    example: 'https://arogya-media.s3.ap-south-1.amazonaws.com/consent_photo/...',
  }),
  s3Key: z.string().openapi({
    description: 'Pass this back as `s3Key` in POST /media to finalize the record.',
  }),
  expiresInSeconds: z.number().openapi({ example: 900 }),
  maxSizeBytes: z.number().openapi({ example: 26214400 }),
});

const mediaAssetSchema = z.object({
  id: z.string().uuid(),
  assetType: z.string().openapi({ example: 'CONSENT_PHOTO' }),
  storageUri: z.string().openapi({ example: 's3://arogya-media/2026/07/consent-abc123.jpg' }),
  mimeType: z.string().openapi({ example: 'image/jpeg' }),
  sizeBytes: z.string().openapi({
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
export function registerMediaAssetRoutes(doc: DocumentedRouter, service: MediaAssetService) {
  const controller = createMediaAssetController(service);

  doc.get(
    '/media',
    {
      summary: 'List media assets',
      tags: ['Media'],
      responses: {
        200: { description: 'Media assets', schema: envelope(z.array(mediaAssetSchema)) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER'),
    controller.list,
  );

  doc.post(
    '/media/upload-url',
    {
      summary: 'Request a presigned S3 upload URL',
      tags: ['Media'],
      body: createUploadUrlDocSchema,
      responses: {
        200: {
          description: 'Presigned upload URL issued',
          schema: envelope(uploadUrlResponseSchema),
        },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR'),
    validateBody(createUploadUrlSchema),
    controller.createUploadUrl,
  );

  doc.post(
    '/media',
    {
      summary: 'Finalize a media asset record after uploading to S3',
      tags: ['Media'],
      body: createMediaAssetDocSchema,
      responses: {
        201: { description: 'Media asset created', schema: envelope(mediaAssetSchema) },
        400: {
          description: 'Validation error, or the S3 object for this key was not found',
          schema: apiErrorSchema,
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
        422: {
          description:
            'The uploaded object size does not match the declared size, or S3 did not return a usable ETag',
          schema: apiErrorSchema,
        },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI', 'SUPERVISOR'),
    validateBody(createMediaAssetSchema),
    controller.create,
  );
}
