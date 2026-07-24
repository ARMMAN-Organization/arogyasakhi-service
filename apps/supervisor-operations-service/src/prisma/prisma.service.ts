import { PrismaClient } from '../../../../node_modules/.prisma/client-supervisor-operations-service';

/**
 * Prisma client for supervisor-operations-service. `connect`/`disconnect` are
 * driven explicitly from the bootstrap (main.ts).
 */
export class PrismaService extends PrismaClient {
  connect(): Promise<void> {
    return this.$connect();
  }

  disconnect(): Promise<void> {
    return this.$disconnect();
  }
}
