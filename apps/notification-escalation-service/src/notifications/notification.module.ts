import { Module } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationController } from './notification.controller';
import { NotificationRepository } from './notification.repository';
import { NotificationService } from './notification.service';

@Module({ controllers: [NotificationController], providers: [NotificationService, NotificationRepository, PrismaService] })
export class NotificationModule {}
