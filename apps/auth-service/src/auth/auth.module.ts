import type { DocumentedRouter } from '@armman/service-commons';
import type { TokenSigner } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthRepository } from './auth.repository';
import { AuthService } from './auth.service';
import { createAuthRouter } from './auth.controller';

/** Composition root for the auth feature: wires repository → service → router. */
export function createAuthModule(
  prisma: PrismaService,
  signer: TokenSigner,
  accessTokenTtl: string,
  refreshTokenTtl: string,
): DocumentedRouter {
  const repository = new AuthRepository(prisma);
  const service = new AuthService(repository, signer, accessTokenTtl, refreshTokenTtl);
  return createAuthRouter(service, signer);
}
