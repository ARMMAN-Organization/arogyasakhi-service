import { asyncHandler, ok, unauthorized } from '../app.module';
import type { MediaAssetService } from './mediaAsset.service';
// Same relative-path-into-generated-client import every service's own
// prisma.service.ts uses (see e.g. apps/media-service/src/prisma/prisma.service.ts,
// or auth-service's geography.repository.ts for another domain-file example) —
// a repo-wide convention rather than a one-off shortcut. The path depth is
// fixed by this file's own location (apps/media-service/src/media/), so it
// only breaks if that directory nesting changes, not from Prisma/package-manager churn.
import type { MediaAsset } from '../../../../node_modules/.prisma/client-media-service';

/**
 * Maps a Prisma row to its wire shape: `sizeBytes` is a `BigInt` on the
 * Prisma model (backing the `Bytes`-range `size_bytes` column), but
 * `JSON.stringify`/`res.json()` cannot serialize a raw `BigInt` — it throws
 * at response time, after the DB write has already succeeded. Converting to
 * a string here matches what `mediaAssetSchema` already documents
 * ("BigInt serialized as string").
 */
function toResponse(asset: MediaAsset) {
  return {
    ...asset,
    sizeBytes: asset.sizeBytes.toString(),
    checksum: asset.checksum.toString('hex'),
  };
}

/**
 * Narrower response for `POST /media`'s finalize step: drops the linkage
 * fields (null on every asset unless the caller explicitly set one — noise
 * when they're unset) and internal audit/soft-delete columns
 * (createdByUserId/updatedByUserId/updatedAt/isDeleted/deletedAt) that a
 * caller finalizing an upload has no use for. `GET /media`'s list view keeps
 * the full row via `toResponse` above — this trim is specific to what the
 * finalize response needs to hand back.
 */
function toFinalizeResponse(asset: MediaAsset) {
  const {
    id,
    assetType,
    storageUri,
    checksum,
    mimeType,
    uploadedByUserId,
    uploadedAt,
    encryptedFlag,
    createdAt,
  } = asset;
  return {
    id,
    assetType,
    storageUri,
    checksum: checksum.toString('hex'),
    mimeType,
    sizeBytes: asset.sizeBytes.toString(),
    uploadedByUserId,
    uploadedAt,
    encryptedFlag,
    createdAt,
  };
}

/**
 * Media asset request handlers. Mounted under the global `api/v1` prefix
 * by `mediaAsset.routes.ts`.
 */
export function createMediaAssetController(service: MediaAssetService) {
  return {
    list: asyncHandler(async (_req, res) => {
      res.json(ok((await service.list()).map(toResponse)));
    }),

    getById: asyncHandler(async (req, res, next) => {
      // Forwarded to auth-service to resolve the uploader's display name —
      // see mediaAsset.service.ts's getById() and auth.client.ts.
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());
      res.json(ok(await service.getById(req.params.id, authorizationHeader)));
    }),

    createUploadUrl: asyncHandler(async (req, res) => {
      res.json(ok(await service.createUploadUrl(req.body)));
    }),

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(toFinalizeResponse(created)));
    }),
  };
}
