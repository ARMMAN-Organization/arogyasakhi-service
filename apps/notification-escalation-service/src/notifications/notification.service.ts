import type { NotificationRepository } from './notification.repository';
import type { CreateNotificationInput } from './dto/create-notification.dto';

/** Notification domain logic. Data access is delegated to the repository. */
export class NotificationService {
  constructor(private readonly repository: NotificationRepository) {}

  list() {
    return this.repository.findMany();
  }

  create(dto: CreateNotificationInput) {
    return this.repository.create(dto);
  }
}
