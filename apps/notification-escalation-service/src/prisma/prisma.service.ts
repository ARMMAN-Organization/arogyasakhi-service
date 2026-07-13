import { PrismaClient } from '../../../../node_modules/.prisma/client-notification-escalation-service';

export class PrismaService extends PrismaClient {
  connect(): Promise<void> {
    return this.$connect();
  }
  disconnect(): Promise<void> {
    return this.$disconnect();
  }
}
