import { badGateway, notFound, unprocessable } from '@armman/service-commons';
import { appConfig } from '../config/app-config';
import type { SupervisorRepository } from './supervisor.repository';
import { sendTransferNoticeEmail } from './ses-email.client';
import type { SendTransferNoticeInput } from './dto/send-transfer-notice.dto';

/** Business logic for the Supervisor→Manager hierarchy link and the Missed
 * Visit Escalation TRANSFER Manager-notice email (FR-SV-4.3). */
export class SupervisorService {
  constructor(private readonly repository: SupervisorRepository) {}

  /**
   * Links a Supervisor to her Manager. Both ends are validated against an
   * active role assignment (not just "the id exists") — a wrong id here
   * would silently misdirect every one of that Supervisor's Sakhis' Missed
   * Visit Escalation transfer emails.
   */
  async setManager(supervisorUserId: string, managerUserId: string, updatedByUserId: string) {
    const supervisorRole = await this.repository.findActiveUserRole(supervisorUserId, 'SUPERVISOR');
    if (!supervisorRole) {
      throw unprocessable('This user does not hold an active SUPERVISOR role.');
    }

    const managerUser = await this.repository.findUserById(managerUserId);
    if (!managerUser) {
      throw notFound('managerUserId does not reference an existing user.');
    }
    const managerRole = await this.repository.findActiveUserRole(managerUserId, 'MANAGER');
    if (!managerRole) {
      throw unprocessable('managerUserId does not hold an active MANAGER role.');
    }

    await this.repository.upsertManager(supervisorUserId, managerUserId, updatedByUserId);
    return { userId: supervisorUserId, managerUserId };
  }

  /**
   * Resolves FR-SV-4.3's "designated Manager" for a Sakhi: her
   * SakhiProfile.supervisorId, then that Supervisor's own
   * SupervisorProfile.managerUserId, then that Manager's User.email. Falls
   * back to the configured default Manager address at whichever hop is
   * missing — real org data for this chain doesn't exist for any Supervisor
   * yet (SupervisorProfile has no rows until an ADMIN starts calling
   * setManager), so treating a missing link as a hard failure would break
   * TRANSFER for every Sakhi today. `usedFallback` lets the caller log which
   * case happened, for the org-data cleanup this is standing in for.
   */
  async resolveManagerContact(
    sakhiId: string,
  ): Promise<{ email: string; usedFallback: boolean; sakhiName: string }> {
    const sakhiProfile = await this.repository.findSakhiProfileByUserId(sakhiId);
    if (!sakhiProfile) throw notFound('Sakhi not found.');
    const sakhiName = sakhiProfile.user.displayName;

    const fallback = appConfig.DEFAULT_TRANSFER_MANAGER_EMAIL;
    const supervisorId = sakhiProfile.supervisorId;
    const supervisorProfile = supervisorId
      ? await this.repository.findSupervisorProfileByUserId(supervisorId)
      : null;
    const managerUserId = supervisorProfile?.managerUserId ?? null;
    const managerUser = managerUserId ? await this.repository.findUserById(managerUserId) : null;

    if (managerUser?.email) {
      return { email: managerUser.email, usedFallback: false, sakhiName };
    }
    if (fallback) {
      console.warn(
        `No Manager resolved for Sakhi ${sakhiId} (supervisorId=${supervisorId ?? 'none'}, ` +
          `managerUserId=${managerUserId ?? 'none'}) — using the default Manager address.`,
      );
      return { email: fallback, usedFallback: true, sakhiName };
    }
    throw badGateway(
      'No Manager contact could be resolved for this Sakhi, and no default Manager email is configured.',
    );
  }

  /** Sends the TRANSFER Manager-notice email — see ses-email.client.ts. */
  async sendTransferNotice(input: SendTransferNoticeInput) {
    const { email, usedFallback, sakhiName } = await this.resolveManagerContact(input.sakhiId);
    const sent = await sendTransferNoticeEmail({
      to: email,
      sakhiName,
      beneficiaryName: input.beneficiaryName,
      visitsMissedCount: input.visitsMissedCount,
      visitType: input.visitType,
    });
    return { sent, managerEmail: email, usedFallback };
  }
}
