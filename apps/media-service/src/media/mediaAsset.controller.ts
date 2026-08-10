import { asyncHandler, ok } from '../app.module';
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
  return { ...asset, sizeBytes: asset.sizeBytes.toString() };
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

    create: asyncHandler(async (req, res) => {
      const created = await service.create(req.body);
      res.status(201).json(ok(toResponse(created)));
    }),
  };
}
