import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { GeographyRepository } from '../geography/geography.repository';
import { ProjectRepository } from '../projects/project.repository';
import { MasterDataService } from './master-data.service';
import { registerMasterDataRoutes } from './master-data.routes';

/** Composition root for the master-data delta feature: wires repositories → service → routes. */
export function createMasterDataModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const geographyRepository = new GeographyRepository(prisma);
  const projectRepository = new ProjectRepository(prisma);
  const service = new MasterDataService(geographyRepository, projectRepository);
  const doc = createDocumentedRouter();
  registerMasterDataRoutes(doc, service, signer);
  return doc;
}
