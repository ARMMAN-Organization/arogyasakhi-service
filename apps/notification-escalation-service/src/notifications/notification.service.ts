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
   * ADMIN and SYSTEM may notify anyone — SYSTEM is a machine identity (the
   * missed-visit/referral-followup/sync-delay cron jobs' service-account
   * token, per requireRoles('ADMIN', 'SUPERVISOR', 'SYSTEM', 'SAKHI') on
   * this route) sending recipientUserId values that are Supervisors, not
   * Sakhis, so the Sakhi-roster ownership check below doesn't apply to it
   * (and would always 403 it, since sakhiClient.findById on a Supervisor id
   * resolves to nothing). A SUPERVISOR (the role widened for
   * approval-service's Quick Response decisions to forward through) may
   * only notify a Sakhi actually assigned to them — verified via
   * auth-service, same ownership check supervisor-operations-service
   * already applies to its own Sakhi-scoped endpoints. A SAKHI (widened for
   * ApprovalRequestService.notifySupervisor(), which forwards the
   * submitting Sakhi's own token) may only notify her own assigned
   * Supervisor — the reverse direction of the SUPERVISOR check, resolved by
   * looking up the caller's own Sakhi record rather than the recipient's.
   * Without either check, the widened roles would let any Supervisor/Sakhi
   * notify any recipientUserId.
   *
   * ADMIN/SYSTEM (and then SUPERVISOR) are checked before SAKHI, not just
   * "else if" — a caller can hold multiple concurrent role assignments
   * (`AuthService.issueTokens` puts every active role code into the JWT's
   * `roles` array with no precedence), so an ADMIN or SUPERVISOR who also
   * carries a SAKHI role assignment must still get the ADMIN/SUPERVISOR
   * behavior, not be misrouted into the restrictive SAKHI-only-notify-her-
   * own-Supervisor branch. Same precedence AuthService.reactivateUser
   * already applies for the same reason.
   *
   * For escalation/operational notification types, also best-effort fans
   * out a copy to the Sakhi's assigned Supervisor (see supervisor-fanout.ts).
   */
  async create(dto: CreateNotificationInput, caller: CallerIdentity, authorizationHeader: string) {
    if (caller.roles.includes('ADMIN') || caller.roles.includes('SYSTEM')) {
      // No ownership check — may notify anyone.
    } else if (caller.roles.includes('SUPERVISOR')) {
      const sakhi = await this.sakhiClient.findById(dto.recipientUserId, authorizationHeader);
      if (!sakhi || sakhi.supervisorId !== caller.id) {
        throw forbidden('You do not have access to notify this Sakhi.');
      }
    } else if (caller.roles.includes('SAKHI')) {
      const sakhi = await this.sakhiClient.findById(caller.id, authorizationHeader);
      if (!sakhi || !sakhi.supervisorId || sakhi.supervisorId !== dto.recipientUserId) {
        throw forbidden('You do not have access to notify this recipient.');
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
