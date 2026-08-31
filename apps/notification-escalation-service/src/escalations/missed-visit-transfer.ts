import { conflict } from '@armman/service-commons';
import type { EscalationRepository } from './escalation.repository';
import type { NotificationRepository } from '../notifications/notification.repository';
import { fanOutToSupervisor } from '../notifications/supervisor-fanout';
import type { BeneficiaryClient } from './beneficiary.client';
import type { ManagerNoticeClient } from './manager-notice.client';
import type { SakhiClient } from './sakhi.client';
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
  sakhiClient: SakhiClient;
}

/**
 * Decides a Missed Visit Escalation's TRANSFER action (FR-SV-4.3): removes
 * the beneficiary from the Sakhi's active list first, then moves the card to
 * TRANSFER_REQUESTED with a 15-day Manager review deadline. This order
 * matters — `markPendingTransfer` is allowed to throw and abort here, rather
 * than being best-effort, so a beneficiary-service outage leaves the card
 * still OPEN (safely retryable) instead of permanently marked decided while
 * the beneficiary never actually left the roster (previously, the escalation
 * was flipped to TRANSFER_REQUESTED first and a `markPendingTransfer`
 * failure was only logged, leaving the two systems out of sync with no way
 * to recover short of a manual DB fix). Once both of those have succeeded,
 * emailing the Manager and notifying the Sakhi in-app stay best-effort,
 * logged not thrown, since the decision itself is already committed by that
 * point. Those two share one outer fetch for the beneficiary's name/sakhiId
 * — if that fetch itself fails, both are skipped (mirrors decideMissedVisit's
 * own CLOSE-branch tolerance).
 */
export async function decideTransfer(
  existing: EscalationEventRow,
  deps: Deps,
  authorizationHeader: string,
) {
  const {
    repository,
    notificationRepository,
    beneficiaryClient,
    managerNoticeClient,
    sakhiClient,
  } = deps;
  const id = existing.id;
  const reviewDeadlineAt = new Date(Date.now() + MANAGER_REVIEW_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  // TRANSFER only ever applies to a MISSED_VISIT-type escalation, which
  // always carries beneficiaryId (only SYNC_DELAY uses sakhiUserId instead —
  // see EscalationEvent.beneficiaryId's schema doc comment).
  if (!existing.beneficiaryId) {
    throw new Error(`Escalation ${existing.escalationType} row has no beneficiaryId.`);
  }

  await beneficiaryClient.markPendingTransfer(existing.beneficiaryId, authorizationHeader);

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
      const notificationDto = {
        recipientUserId: beneficiary.sakhiId,
        notificationType: 'BENEFICIARY_TRANSFER_NOTICE' as const,
        title: 'Beneficiary removed for Manager review',
        body:
          'A beneficiary has been removed from your list pending a Manager review of a ' +
          'missed-visit transfer.',
        priority: 5,
        linkedEntityType: 'EscalationEvent',
        linkedEntityId: id,
        status: 'UNREAD' as const,
      };
      await notificationRepository.create(notificationDto);
      await fanOutToSupervisor(
        notificationRepository,
        sakhiClient,
        notificationDto,
        authorizationHeader,
      );
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
