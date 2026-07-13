import { PrismaClient } from '../../../../node_modules/.prisma/client-beneficiary-service';

/** Manages the Prisma connection lifecycle for this service. */
export class PrismaService extends PrismaClient {
  connect(): Promise<void> {
    return this.$connect();
  }

  disconnect(): Promise<void> {
    return this.$disconnect();
  }
}
