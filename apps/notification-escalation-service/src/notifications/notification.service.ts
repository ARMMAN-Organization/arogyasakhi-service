import { forbidden } from '@armman/service-commons';
import type { NotificationRepository } from './notification.repository';
import type { SakhiClient } from './sakhi.client';
import type { CreateNotificationInput } from './dto/create-notification.dto';

export interface CallerIdentity {
  id: string;
  roles: string[];
}

/** Notification domain logic. Data access is delegated to the repository. */
export class NotificationService {
  constructor(
    private readonly repository: NotificationRepository,
    private readonly sakhiClient: SakhiClient,
  ) {}

  list() {
    return this.repository.findMany();
  }

  /**
   * ADMIN may notify anyone. A SUPERVISOR (the role widened for approval-
   * service's Quick Response decisions to forward through) may only notify
   * a Sakhi actually assigned to them — verified via auth-service, same
   * ownership check supervisor-operations-service already applies to its
   * own Sakhi-scoped endpoints. Without this, the widened role would let
   * any Supervisor notify any recipientUserId.
   */
  async create(dto: CreateNotificationInput, caller: CallerIdentity, authorizationHeader: string) {
    if (!caller.roles.includes('ADMIN')) {
      const sakhi = await this.sakhiClient.findById(dto.recipientUserId, authorizationHeader);
      if (!sakhi || sakhi.supervisorId !== caller.id) {
        throw forbidden('You do not have access to notify this Sakhi.');
      }
    }
    return this.repository.create(dto);
  }
}
