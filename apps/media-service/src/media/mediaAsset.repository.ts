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

  /**
   * `filters.followupId` narrows to one referral follow-up's evidence media
   * (case paper, discharge summary, facility photo, etc.) — omitted, this
   * is the unfiltered "50 most recent" list. Also excludes soft-deleted
   * assets (a fix bundled here — the unfiltered list previously did not
   * apply this filter at all).
   */
  findMany(filters?: { followupId?: string }) {
    return this.prisma.mediaAsset.findMany({
      where: {
        isDeleted: false,
        ...(filters?.followupId ? { followupId: filters.followupId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findById(id: string) {
    return this.prisma.mediaAsset.findFirst({ where: { id, isDeleted: false } });
  }

  create(data: Prisma.MediaAssetCreateInput) {
    return this.prisma.mediaAsset.create({ data });
  }
}
