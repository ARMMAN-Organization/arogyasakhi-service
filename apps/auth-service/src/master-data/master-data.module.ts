import type { DocumentedRouter, TokenSigner } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { GeographyRepository } from '../geography/geography.repository';
import { ProjectRepository } from '../projects/project.repository';
import { MasterDataService } from './master-data.service';
import { createMasterDataRouter } from './master-data.controller';

/** Composition root for the master-data delta feature: wires repositories → service → router. */
export function createMasterDataModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const geographyRepository = new GeographyRepository(prisma);
  const projectRepository = new ProjectRepository(prisma);
  const service = new MasterDataService(geographyRepository, projectRepository);
  return createMasterDataRouter(service, signer);
}
