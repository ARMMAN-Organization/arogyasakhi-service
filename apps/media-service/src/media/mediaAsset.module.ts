import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { MediaAssetRepository } from './mediaAsset.repository';
import { MediaAssetService } from './mediaAsset.service';
import { createMediaAssetRouter } from './mediaAsset.controller';

/**
 * Composition root for the media feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createMediaAssetModule(prisma: PrismaService): DocumentedRouter {
  const repository = new MediaAssetRepository(prisma);
  const service = new MediaAssetService(repository);
  return createMediaAssetRouter(service);
}
