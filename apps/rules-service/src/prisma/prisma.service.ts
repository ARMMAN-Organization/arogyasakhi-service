import { PrismaClient } from '../../../../node_modules/.prisma/client-rules-service';

/**
 * Prisma client for rules-service. `connect`/`disconnect` are driven explicitly
 * from the bootstrap (main.ts) instead of Nest lifecycle hooks.
 */
export class PrismaService extends PrismaClient {
  connect(): Promise<void> {
    return this.$connect();
  }

  disconnect(): Promise<void> {
    return this.$disconnect();
  }
}
