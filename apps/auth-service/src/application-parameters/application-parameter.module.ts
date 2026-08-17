import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { ApplicationParameterRepository } from './application-parameter.repository';
import { ApplicationParameterService } from './application-parameter.service';
import { registerApplicationParameterRoutes } from './application-parameter.routes';

/** Composition root for the application-parameters feature: wires repository → service → routes. */
export function createApplicationParameterModule(
  prisma: PrismaService,
  signer: TokenSigner,
): DocumentedRouter {
  const repository = new ApplicationParameterRepository(prisma);
  const service = new ApplicationParameterService(repository);
  const doc = createDocumentedRouter();
  registerApplicationParameterRoutes(doc, service, signer);
  return doc;
}
