import type { TokenSigner } from '@armman/service-commons';
import { createDocumentedRouter, type DocumentedRouter } from '../app.module';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { registerAuthRoutes } from './auth.routes';

/** Composition root for the auth feature: wires repository → service → routes. */
export function createAuthModule(
  prisma: PrismaService,
  signer: TokenSigner,
  adminAccessTokenTtl: string,
): DocumentedRouter {
  const repository = new AuthRepository(prisma);
  const service = new AuthService(repository, signer, adminAccessTokenTtl);
  const doc = createDocumentedRouter();
  registerAuthRoutes(doc, service, signer);
  return doc;
}
