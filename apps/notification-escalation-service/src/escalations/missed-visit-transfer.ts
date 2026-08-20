import { conflict } from '@armman/service-commons';
import type { EscalationRepository } from './escalation.repository';
import type { NotificationRepository } from '../notifications/notification.repository';
import type { BeneficiaryClient } from './beneficiary.client';
import type { ManagerNoticeClient } from './manager-notice.client';
import { MISSED_VISIT_TYPE_MAP } from './missed-visit-types';

/** FR-SV-4.3 — how long a Manager has to review a TRANSFER before the
 * beneficiary's schedule has run independently past the window. */
const MANAGER_REVIEW_WINDOW_DAYS = 15;

type EscalationEventRow = NonNullable<Awaited<ReturnType<EscalationRepository['findById']>>>;

interface Deps {
  repository: EscalationRepository;
  notificationRepository: NotificationRepository;
  beneficiaryClient: BeneficiaryClient;
  managerNoticeClient: ManagerNoticeClient;
}

/**
 * Decides a Missed Visit Escalation's TRANSFER action (FR-SV-4.3): moves the
 * card to TRANSFER_REQUESTED with a 15-day Manager review deadline, then —
 * best-effort, logged not thrown, since that decision is already committed —
 * removes the beneficiary from the Sakhi's active list, emails her
 * designated Manager, and notifies the Sakhi in-app. Each of the three side
 * effects gets its own try/catch: a beneficiary-service outage must not also
 * silently skip the Sakhi's notification, and vice versa. The Manager email
 * and Sakhi notification both need the beneficiary's name/sakhiId, so they
 * share one outer fetch — if that fetch itself fails, both are skipped
 * (mirrors decideMissedVisit's own CLOSE-branch tolerance), while the
 * roster-removal call runs independently of it.
 */
export async function decideTransfer(
  existing: EscalationEventRow,
  deps: Deps,
  authorizationHeader: string,
) {
  const { repository, notificationRepository, beneficiaryClient, managerNoticeClient } = deps;
  const id = existing.id;
  const reviewDeadlineAt = new Date(Date.now() + MANAGER_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const updated = await repository.updateStatus(
    id,
    'OPEN',
    'TRANSFER_REQUESTED',
    'TRANSFER',
    reviewDeadlineAt,
  );
  if (!updated) {
    throw conflict('This Missed Visit Escalation card has already been decided.');
  }

  try {
    await beneficiaryClient.markPendingTransfer(existing.beneficiaryId, authorizationHeader);
  } catch (err) {
    console.error(
      `Missed Visit Escalation ${id} was transferred but removing the beneficiary from the ` +
        "Sakhi's list failed:",
      err,
    );
  }

  try {
    const beneficiary = await beneficiaryClient.getById(
      existing.beneficiaryId,
      authorizationHeader,
    );
    const visitType = MISSED_VISIT_TYPE_MAP[existing.escalationType] ?? existing.escalationType;

    try {
      await managerNoticeClient.send(
        {
          sakhiId: beneficiary.sakhiId,
          beneficiaryName: beneficiary.pii.fullName,
          visitsMissedCount: existing.visitsMissedCount,
          visitType,
        },
        authorizationHeader,
      );
    } catch (err) {
      console.error(
        `Missed Visit Escalation ${id} was transferred but emailing the Manager failed:`,
        err,
      );
    }

    try {
      await notificationRepository.create({
        recipientUserId: beneficiary.sakhiId,
        notificationType: 'BENEFICIARY_TRANSFER_NOTICE',
        title: 'Beneficiary removed for Manager review',
        body:
          'A beneficiary has been removed from your list pending a Manager review of a ' +
          'missed-visit transfer.',
        priority: 5,
        linkedEntityType: 'EscalationEvent',
        linkedEntityId: id,
        status: 'UNREAD',
      });
    } catch (err) {
      console.error(
        `Missed Visit Escalation ${id} was transferred but notifying the Sakhi failed:`,
        err,
      );
    }
  } catch (err) {
    console.error(
      `Missed Visit Escalation ${id} was transferred but resolving the beneficiary for the ` +
        'Manager email/Sakhi notification failed:',
      err,
    );
  }

  return repository.findById(id);
}
