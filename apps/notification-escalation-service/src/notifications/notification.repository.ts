import type { PrismaService } from '../prisma/prisma.service';
import type { CreateNotificationInput } from './dto/create-notification.dto';

/** Data access for notifications. Owns only this service's `notification` table. */
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany() {
    return this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 });
  }

  create(data: CreateNotificationInput) {
    return this.prisma.notification.create({ data });
  }
}
