import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema at module-load time — matches every other
// service's HTTP-only client convention (e.g. closure-reopen-service's own
// beneficiary.client.ts).
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface BeneficiaryRecord {
  id: string;
  sakhiId: string;
  motherCaseDetails: { eddDate: string } | null;
  pii: { fullName: string; mobileNumber: string };
  riskLevel: 'none' | 'mild' | 'moderate' | 'high';
}

/**
 * Resolves a beneficiary by calling beneficiary-service's GET
 * /beneficiaries/:id through the gateway, forwarding the caller's own
 * Authorization header. Used by EscalationService.decideMissedVisit's CLOSE
 * action to find who to notify (escalation_events carries no sakhiId column
 * of its own), and by getEddNearingDetail to resolve motherCaseDetails.eddDate
 * (escalation_events carries no EDD date of its own either).
 */
export class BeneficiaryClient {
  async getById(beneficiaryId: string, authorizationHeader: string): Promise<BeneficiaryRecord> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}`, {
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to resolve the beneficiary — beneficiary-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the beneficiary.');
      }
      throw badGateway(
        'Unable to resolve the beneficiary — beneficiary-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: BeneficiaryRecord };
    return body.data;
  }

  /**
   * Missed Visit Escalation TRANSFER (FR-SV-4.3) — moves the beneficiary to
   * PENDING_TRANSFER via beneficiary-service's PATCH /beneficiaries/:id/transfer,
   * removing her from the Sakhi's active-filtered roster. Mirrors getById's
   * error-mapping exactly.
   */
  async markPendingTransfer(beneficiaryId: string, authorizationHeader: string): Promise<void> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/transfer`, {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader },
      });
    } catch {
      throw badGateway('Unable to transfer the beneficiary — beneficiary-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to transfer the beneficiary.');
      }
      throw badGateway(
        'Unable to transfer the beneficiary — beneficiary-service returned an error.',
      );
    }
  }
}
