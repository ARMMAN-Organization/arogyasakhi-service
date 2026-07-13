import { PrismaClient } from '../../../../node_modules/.prisma/client-risk-referral-service';

/**
 * Prisma client for risk-referral-service. `connect`/`disconnect` are driven
 * explicitly from the bootstrap (main.ts) instead of Nest lifecycle hooks.
 */
export class PrismaService extends PrismaClient {
  connect(): Promise<void> {
    return this.$connect();
  }

  disconnect(): Promise<void> {
    return this.$disconnect();
  }
}
