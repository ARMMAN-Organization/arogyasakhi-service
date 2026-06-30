import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationRepository {
  constructor(private readonly prisma: PrismaService) {}
  findMany() { return this.prisma.notification.findMany({ orderBy: { createdAt: 'desc' }, take: 50 }); }
  create(data: CreateNotificationDto) { return this.prisma.notification.create({ data }); }
}
