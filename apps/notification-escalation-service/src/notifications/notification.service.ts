import { forbidden, notFound } from '@armman/service-commons';
import type { NotificationRepository } from './notification.repository';
import type { SakhiClient } from './sakhi.client';
import type { CreateNotificationInput } from './dto/create-notification.dto';
import { fanOutToSupervisor } from './supervisor-fanout';

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

  list(caller: CallerIdentity) {
    return this.repository.findMany(caller.id);
  }

  /**
   * ADMIN may notify anyone. A SUPERVISOR (the role widened for approval-
   * service's Quick Response decisions to forward through) may only notify
   * a Sakhi actually assigned to them — verified via auth-service, same
   * ownership check supervisor-operations-service already applies to its
   * own Sakhi-scoped endpoints. Without this, the widened role would let
   * any Supervisor notify any recipientUserId.
   *
   * For escalation/operational notification types, also best-effort fans
   * out a copy to the Sakhi's assigned Supervisor (see supervisor-fanout.ts).
   */
  async create(dto: CreateNotificationInput, caller: CallerIdentity, authorizationHeader: string) {
    if (!caller.roles.includes('ADMIN')) {
      const sakhi = await this.sakhiClient.findById(dto.recipientUserId, authorizationHeader);
      if (!sakhi || sakhi.supervisorId !== caller.id) {
        throw forbidden('You do not have access to notify this Sakhi.');
      }
    }
    const created = await this.repository.create(dto);
    await fanOutToSupervisor(this.repository, this.sakhiClient, dto, authorizationHeader);
    return created;
  }

  /**
   * Marks a notification READ or DISMISSED. Ownership-only — the caller
   * must be the notification's own recipientUserId (Sakhi dashboard banner
   * dismiss, Supervisor notifications list tap-to-read); no ADMIN bypass,
   * unlike create(), since there's no cross-user "mark read on behalf of"
   * use case here.
   */
  async updateStatus(id: string, status: 'READ' | 'DISMISSED', caller: CallerIdentity) {
    const existing = await this.repository.findById(id);
    if (!existing) throw notFound('Notification not found.');
    if (existing.recipientUserId !== caller.id) {
      throw forbidden('You do not have access to this notification.');
    }

    const updated = await this.repository.updateStatus(id, caller.id, status);
    if (!updated) {
      // Raced with a delete between the read above and the conditional
      // update — same outcome as a not-found, just caught a beat later.
      throw notFound('Notification not found.');
    }

    return this.repository.findById(id);
  }
}
