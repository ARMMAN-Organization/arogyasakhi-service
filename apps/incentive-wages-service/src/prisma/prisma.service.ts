import { PrismaClient } from '../../../../node_modules/.prisma/client-incentive-wages-service';

/**
 * Prisma client for incentive-wages-service. `connect`/`disconnect` are driven
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
