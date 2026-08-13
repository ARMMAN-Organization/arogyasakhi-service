import type { PrismaService } from '../prisma/prisma.service';
// The generated Prisma input type, not `CreateMediaAssetInput` (the client
// request DTO) — the service layer assembles the full row (storageUri,
// checksum, mimeType, sizeBytes derived from S3, not the client) before
// calling this method, so the repository's input type must match that
// resolved shape rather than the narrower client-facing one.
import type { Prisma } from '../../../../node_modules/.prisma/client-media-service';

/** Data access for media assets. Owns only this service's `mediaAsset` table. */
export class MediaAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: Prisma.MediaAssetCreateInput) {
    return this.prisma.mediaAsset.create({ data });
  }
}
