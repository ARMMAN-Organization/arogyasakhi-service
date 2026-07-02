import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaAssetController } from './mediaAsset.controller';
import { MediaAssetRepository } from './mediaAsset.repository';
import { MediaAssetService } from './mediaAsset.service';

@Module({ controllers: [MediaAssetController], providers: [MediaAssetService, MediaAssetRepository, PrismaService] })
export class MediaAssetModule {}
