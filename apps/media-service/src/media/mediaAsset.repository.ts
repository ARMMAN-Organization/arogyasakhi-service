import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateMediaAssetDto } from './dto/create-mediaAsset.dto';

@Injectable()
export class MediaAssetRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.mediaAsset.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateMediaAssetDto) { return this.prisma.mediaAsset.create({ data }); }
}
