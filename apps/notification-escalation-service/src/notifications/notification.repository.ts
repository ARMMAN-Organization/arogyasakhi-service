import type { PrismaService } from '../prisma/prisma.service';
import type { CreateNotificationInput } from './dto/create-notification.dto';

/** Data access for notifications. Owns only this service's `notification` table. */
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(recipientUserId: string) {
    return this.prisma.notification.findMany({
      where: { recipientUserId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  findById(id: string) {
    return this.prisma.notification.findFirst({ where: { id, isDeleted: false } });
  }

  create(data: CreateNotificationInput) {
    return this.prisma.notification.create({ data });
  }

  /**
   * Marks a notification READ or DISMISSED. `recipientUserId` is part of the
   * `where` (not just the service-layer check) so the ownership guard is
   * concurrency-safe — `updateMany`'s affected count, not a separate
   * read-then-write, decides whether the update actually applied. Same
   * conditional-update pattern as EscalationRepository.updateStatus.
   */
  async updateStatus(
    id: string,
    recipientUserId: string,
    status: 'READ' | 'DISMISSED',
  ): Promise<boolean> {
    const result = await this.prisma.notification.updateMany({
      where: { id, recipientUserId, isDeleted: false },
      data: {
        status,
        ...(status === 'READ' ? { readAt: new Date() } : { dismissedAt: new Date() }),
      },
    });
    return result.count > 0;
  }
}
