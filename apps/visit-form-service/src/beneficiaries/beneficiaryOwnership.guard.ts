import { forbidden, notFound } from '@armman/service-commons';
import { findBeneficiaryOwnership } from './beneficiary.client';
import { listSakhiIdsForSupervisor } from '../sakhis/sakhi.client';

export interface CallerIdentity {
  readonly id: string;
  readonly roles: readonly string[];
  readonly projectId?: string | null;
}

/**
 * Resolves a beneficiary's ownership via the narrow, non-enriching
 * `/ownership` endpoint (see findBeneficiaryOwnership's own doc comment for
 * the cross-service infinite-loop this avoids) and enforces SAKHI own-case /
 * SUPERVISOR own-roster / MANAGER-ADMIN-unrestricted — the exact ownership
 * check duplicated, before this extraction, across
 * form.service.ts#getLatestVisitVitals and
 * visitInstance.service.ts#getVisitHistory. One copy drifting here is a
 * security bug, not a style issue, so both callers now share this.
 */
export async function assertCallerOwnsBeneficiary(
  beneficiaryId: string,
  caller: CallerIdentity,
  authorizationHeader: string,
): Promise<void> {
  const beneficiary = await findBeneficiaryOwnership(beneficiaryId, authorizationHeader);
  if (!beneficiary) throw notFound('Beneficiary case not found.');

  if (caller.roles.includes('SAKHI')) {
    if (beneficiary.sakhiId !== caller.id) {
      throw forbidden('This beneficiary case is outside your own roster.');
    }
    return;
  }

  if (caller.roles.includes('SUPERVISOR')) {
    if (!caller.projectId) {
      throw forbidden('Supervisor caller has no project scope.');
    }
    const roster = await listSakhiIdsForSupervisor(
      caller.projectId,
      caller.id,
      authorizationHeader,
    );
    if (!roster.includes(beneficiary.sakhiId)) {
      throw forbidden("This beneficiary case is outside this Supervisor's roster.");
    }
  }
}
