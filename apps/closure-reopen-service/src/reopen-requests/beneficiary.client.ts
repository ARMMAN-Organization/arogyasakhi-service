import { badGateway, HttpError } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema (requires DATABASE_URL etc. with no defaults),
// which process.exit(1)s at module-load time in any test that never
// otherwise loads config — matches every other service's HTTP-only client
// convention (e.g. visit-form-service's create-child.client.ts).
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

export interface BeneficiaryCaseRecord {
  id: string;
  currentStatus: string;
}

/**
 * Reactivates a CLOSED beneficiary case by calling beneficiary-service's
 * PATCH /beneficiaries/:id/reactivate through the gateway, forwarding the
 * caller's own Authorization header — same pattern this service's
 * AuditClient/NotificationClient use. Used after an approved reopen request
 * (FR-SV-4.7/FR-S-10.3) so "Beneficiary is added to Sakhi's Open beneficiary
 * list" actually happens, not just the reopen_requests row flipping.
 */
export class BeneficiaryClient {
  async reactivateCase(
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseRecord> {
    let res: Response;
    try {
      res = await fetch(
        `${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/reactivate`,
        {
          method: 'PATCH',
          headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        },
      );
    } catch {
      throw badGateway(
        'Unable to reactivate the beneficiary — beneficiary-service is unreachable.',
      );
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to reactivate the beneficiary.');
      }
      throw badGateway(
        'Unable to reactivate the beneficiary — beneficiary-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: BeneficiaryCaseRecord };
    return body.data;
  }

  /**
   * Closes a beneficiary case by calling beneficiary-service's
   * PATCH /beneficiaries/:id/close through the gateway, forwarding the
   * caller's own Authorization header — same pattern as reactivateCase.
   * Used after a non-reviewed closure submission (immediate close) or an
   * approved MIGRATION closure, so the "beneficiary moves to the Closed
   * list" consequence actually happens, not just the closures row updating.
   */
  async closeCase(
    beneficiaryId: string,
    reasonCode: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseRecord> {
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/close`, {
        method: 'PATCH',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ reasonCode }),
      });
    } catch {
      throw badGateway('Unable to close the beneficiary — beneficiary-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to close the beneficiary.');
      }
      throw badGateway('Unable to close the beneficiary — beneficiary-service returned an error.');
    }

    const body = (await res.json()) as { data: BeneficiaryCaseRecord };
    return body.data;
  }

  /**
   * Resolves a beneficiary case by calling beneficiary-service's
   * GET /beneficiaries/:id through the gateway, forwarding the caller's own
   * Authorization header. Used by GET /reopen-requests?beneficiaryId=... to
   * delegate ownership scoping to beneficiary-service's own SAKHI-own-case /
   * SUPERVISOR-roster / MANAGER-unrestricted check — this service has no
   * sakhiId data of its own to check against, and duplicating that IDOR
   * logic here would drift from beneficiary-service's as it evolves.
   */
  async getById(
    beneficiaryId: string,
    authorizationHeader: string,
  ): Promise<BeneficiaryCaseRecord> {
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

    const body = (await res.json()) as { data: BeneficiaryCaseRecord };
    return body.data;
  }
}
