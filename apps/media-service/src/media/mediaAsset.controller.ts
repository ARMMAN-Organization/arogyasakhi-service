import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { MediaAssetService } from './mediaAsset.service';
import { createMediaAssetSchema } from './dto/create-mediaAsset.dto';
// Same relative-path-into-generated-client import every service's own
// prisma.service.ts uses (see e.g. apps/media-service/src/prisma/prisma.service.ts,
// or auth-service's geography.repository.ts for another domain-file example) —
// a repo-wide convention rather than a one-off shortcut. The path depth is
// fixed by this file's own location (apps/media-service/src/media/), so it
// only breaks if that directory nesting changes, not from Prisma/package-manager churn.
import type { MediaAsset } from '../../../../node_modules/.prisma/client-media-service';
import {
  asyncHandler,
  createDocumentedRouter,
  ok,
  requireRoles,
  trustGatewayIdentity,
  validateBody,
} from '../app.module';

extendZodWithOpenApi(z);

/**
 * Maps a Prisma row to its wire shape: `sizeBytes` is a `BigInt` on the
 * Prisma model (backing the `Bytes`-range `size_bytes` column), but
 * `JSON.stringify`/`res.json()` cannot serialize a raw `BigInt` — it throws
 * at response time, after the DB write has already succeeded. Converting to
 * a string here matches what `mediaAssetSchema` already documents
 * ("BigInt serialized as string").
 */
function toResponse(asset: MediaAsset) {
  return { ...asset, sizeBytes: asset.sizeBytes.toString() };
}

// Documentation-only view of the request body (passed via `doc.post`'s
// `body` option, not to `validateBody`):
// - `sizeBytes` is `z.coerce.bigint()` on the real schema, required by
//   Prisma's BigInt column, but zod-to-openapi's own `.isOptionalSchema()`
//   check calls `.isOptional()` on it, which runs the real coercion against
//   `undefined` and throws instead of failing gracefully — no `.openapi()`
//   metadata can suppress that, since the crash happens before metadata is
//   consulted.
// - `checksum` is a hex string piped through `.transform()` on the real
//   schema (see create-mediaAsset.dto.ts) — zod-to-openapi cannot introspect
//   a `ZodEffects`/transform chain and crashes doc generation at startup
//   (same class of issue as z.coerce.*/z.lazy()/z.instanceof() elsewhere in
//   this repo).
// Substituting plain `z.string()` schemas here only changes what Swagger
// *displays*; `validateBody` below still runs the real coercion/transform.
const createMediaAssetDocSchema = createMediaAssetSchema.extend({
  checksum: z.string().openapi({
    example: 'a'.repeat(64),
    description: '64-character hex-encoded SHA-256 checksum of the uploaded file.',
  }),
  sizeBytes: z.string().openapi({
    example: '204800',
    description: 'File size in bytes.',
  }),
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
export function createMediaAssetRouter(service: MediaAssetService) {
  const doc = createDocumentedRouter();

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
    asyncHandler(async (_req, res) => {
      res.json(ok((await service.list()).map(toResponse)));
    }),
  );

  doc.post(
    '/media',
    {
      summary: 'Create a media asset record',
      tags: ['Media'],
      body: createMediaAssetDocSchema,
      responses: {
        201: { description: 'Media asset created', schema: envelope(mediaAssetSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller role not permitted', schema: apiErrorSchema },
      },
    },
    trustGatewayIdentity,
    requireRoles('SAKHI'),
    validateBody(createMediaAssetSchema),
    asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(toResponse(created)));
    }),
  );

  return doc;
}
