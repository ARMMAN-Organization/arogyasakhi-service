import { forbidden, type AuthenticatedUser } from '@armman/service-commons';
import type { EscalationsBySakhiRepository } from './escalations-by-sakhi.repository';
import { BeneficiaryClient } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from './sakhi.client';
import type { EscalationsBySakhiType } from './dto/get-escalations-by-sakhi.dto';

/**
 * Escalation events shaped as Quick-Response-style cards for every
 * beneficiary on a Sakhi's caseload, filtered to the requested escalation
 * types (CLOSURE_PENDING / DELIVERY_FORM_PENDING) — gives a Supervisor/Sakhi
 * screen a roster-wide pending-forms view without one round trip per
 * beneficiary. Mirrors risk-referral-service's RiskBySakhiService.
 */
export class EscalationsBySakhiService {
  constructor(
    private readonly repository: EscalationsBySakhiRepository,
    private readonly beneficiaryClient: BeneficiaryClient = new BeneficiaryClient(),
  ) {}

  async getEscalationsBySakhi(
    sakhiId: string,
    types: EscalationsBySakhiType[],
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ) {
    await this.assertCallerCanViewSakhi(sakhiId, caller, authorizationHeader);

    const beneficiaryIds = await this.beneficiaryClient.getIds(authorizationHeader, sakhiId);
    if (beneficiaryIds.length === 0) {
      return { cards: [] };
    }

    const rows = await this.repository.findOpenByBeneficiaryIdsAndTypes(beneficiaryIds, types);

    return {
      cards: rows.map((row) => ({
        cardId: row.id,
        beneficiaryId: row.beneficiaryId,
        escalationType: row.escalationType,
        status: row.status,
        raisedAt: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * IDOR guard: a SAKHI may only query her own sakhiId; a SUPERVISOR only a
   * sakhiId on their own roster (resolved via auth-service); MANAGER/ADMIN
   * are unscoped. Same shape as risk-referral-service's
   * RiskBySakhiService.assertCallerCanViewSakhi.
   */
  private async assertCallerCanViewSakhi(
    sakhiId: string,
    caller: AuthenticatedUser,
    authorizationHeader: string,
  ): Promise<void> {
    if (caller.roles.includes('MANAGER') || caller.roles.includes('ADMIN')) return;

    if (caller.roles.includes('SUPERVISOR')) {
      if (!caller.projectId) throw forbidden('Supervisor caller has no project scope.');
      const roster = await listSakhiIdsForSupervisor(
        caller.projectId,
        caller.id,
        authorizationHeader,
      );
      if (!roster.includes(sakhiId)) {
        throw forbidden("This Sakhi is outside this Supervisor's roster.");
      }
      return;
    }

    if (sakhiId !== caller.id) {
      throw forbidden('You do not have access to this Sakhi.');
    }
  }
}
