import type { PrismaService } from '../prisma/prisma.service';
import type { CreateMediaAssetInput } from './dto/create-mediaAsset.dto';

/** Data access for media assets. Owns only this service's `mediaAsset` table. */
export class MediaAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateMediaAssetInput) {
    return this.prisma.mediaAsset.create({ data });
  }
}
