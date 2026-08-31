import type { NotificationRepository } from './notification.repository';
import type { CreateNotificationInput } from './dto/create-notification.dto';

interface SakhiLookup {
  findById(
    sakhiId: string,
    authorizationHeader: string,
  ): Promise<{ supervisorId: string | null } | null>;
}

/** Notification types relevant enough to a Supervisor's own roster that she
 * should get a copy too, distinct from purely personal decision-outcome
 * notifications (e.g. LMP_CHANGE_UPDATE, DATA_RESTORE_UPDATE,
 * CLOSURE_REVIEW_UPDATE, REOPEN_UPDATE) that stay Sakhi-only. */
const SUPERVISOR_FANOUT_TYPES = new Set(['MISSED_VISIT_ESCALATION', 'BENEFICIARY_TRANSFER_NOTICE']);

/**
 * Best-effort: also creates a copy of the notification addressed to the
 * Sakhi's assigned Supervisor, for the notification types relevant to her
 * roster. Failures here (Sakhi lookup down, no assigned Supervisor) are
 * logged, never thrown — the Sakhi's own notification is already created by
 * the time this runs and must not be rolled back or blocked by this.
 */
export async function fanOutToSupervisor(
  notificationRepository: NotificationRepository,
  sakhiClient: SakhiLookup,
  dto: CreateNotificationInput,
  authorizationHeader: string,
): Promise<void> {
  if (!SUPERVISOR_FANOUT_TYPES.has(dto.notificationType)) return;
  try {
    const sakhi = await sakhiClient.findById(dto.recipientUserId, authorizationHeader);
    if (sakhi?.supervisorId && sakhi.supervisorId !== dto.recipientUserId) {
      await notificationRepository.create({ ...dto, recipientUserId: sakhi.supervisorId });
    }
  } catch (err) {
    console.error(
      `Failed to notify the Supervisor of Sakhi ${dto.recipientUserId}'s notification:`,
      err,
    );
  }
}
