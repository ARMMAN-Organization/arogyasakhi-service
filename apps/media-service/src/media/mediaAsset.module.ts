import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { MediaAssetRepository } from './mediaAsset.repository';
import { MediaAssetService } from './mediaAsset.service';
import { registerMediaAssetRoutes } from './mediaAsset.routes';

/**
 * Composition root for the media feature: wires repository → service → routes.
 * Replaces the former NestJS module + DI container.
 */
export function createMediaAssetModule(prisma: PrismaService): DocumentedRouter {
  const repository = new MediaAssetRepository(prisma);
  const service = new MediaAssetService(repository);
  const doc = createDocumentedRouter();
  registerMediaAssetRoutes(doc, service);
  return doc;
}
