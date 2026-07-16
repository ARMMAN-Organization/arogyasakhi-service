import type { DocumentedRouter } from '@armman/service-commons';
import type { PrismaService } from '../prisma/prisma.service';
import { ReferralRepository } from './referral.repository';
import { ReferralService } from './referral.service';
import { createReferralRouter } from './referral.controller';

/**
 * Composition root for the referrals feature: wires repository → service → router.
 * Replaces the former NestJS module + DI container.
 */
export function createReferralModule(prisma: PrismaService): DocumentedRouter {
  const repository = new ReferralRepository(prisma);
  const service = new ReferralService(repository);
  return createReferralRouter(service);
}
