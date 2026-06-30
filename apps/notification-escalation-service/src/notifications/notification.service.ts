import { Injectable } from '@nestjs/common';
import { NotificationRepository } from './notification.repository';
import type { CreateNotificationDto } from './dto/create-notification.dto';

@Injectable()
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}
  list() { return this.repository.findMany(); }
  create(dto: CreateNotificationDto) { return this.repository.create(dto); }
}
