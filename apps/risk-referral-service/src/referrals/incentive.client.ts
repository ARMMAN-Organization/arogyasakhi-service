import { badGateway, HttpError, notFound } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — see beneficiary.client.ts in this same folder
// for the same rationale.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

interface IncentiveRateRecord {
  id: string;
}

/**
 * Resolves the active incentive rate and creates an incentive event by
 * calling incentive-wages-service's GET /incentive-rates/active and
 * POST /incentives through the gateway, forwarding the caller's own
 * Authorization header — same pattern this service's sibling clients use.
 * Used for the Accompanied Referral decision alias's incentive trigger
 * (FR-SV-4.9). Mirrors approval-service's own incentive.client.ts (used by
 * Quick Response's decideAccompaniedReferralCard) — including its known gap
 * of never forwarding a geographyUnitId, so the ₹160/₹300 geography-specific
 * split isn't wired end-to-end here either; that's a separate, pre-existing
 * issue, not something specific to this alias.
 */
export class IncentiveClient {
  private async findActiveRate(
    referralType: 'ACCOMPANIED',
    authorizationHeader: string,
  ): Promise<IncentiveRateRecord | null> {
    let res: Response;
    try {
      res = await fetch(
        `${API_GATEWAY_BASE_URL}/api/v1/incentive-rates/active?rateType=REFERRAL&referralType=${referralType}`,
        { headers: { Authorization: authorizationHeader } },
      );
    } catch {
      throw badGateway(
        'Unable to resolve the incentive rate — incentive-wages-service is unreachable.',
      );
    }

    if (res.status === 404) return null;
    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to resolve the incentive rate.');
      }
      throw badGateway(
        'Unable to resolve the incentive rate — incentive-wages-service returned an error.',
      );
    }

    const body = (await res.json()) as { data: IncentiveRateRecord };
    return body.data;
  }

  /**
   * Triggers an ACCOMPANIED_REFERRAL incentive for the given Sakhi. Throws
   * (not tolerated internally) if no active rate is configured — the caller
   * (ReferralService.decideAccompanied) treats this as best-effort and logs
   * rather than failing the whole decision request.
   */
  async triggerAccompaniedReferral(
    sakhiId: string,
    referralId: string,
    authorizationHeader: string,
  ): Promise<void> {
    const rate = await this.findActiveRate('ACCOMPANIED', authorizationHeader);
    if (!rate) {
      throw notFound('No active incentive rate configured for accompanied referrals.');
    }

    const now = new Date();
    let res: Response;
    try {
      res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/incentives`, {
        method: 'POST',
        headers: { Authorization: authorizationHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sakhiId,
          sourceEntityType: 'REFERRAL',
          sourceEntityId: referralId,
          eventMonth: now.toISOString(),
          rateId: rate.id,
          quantity: 1,
          // amountInr is deliberately omitted — incentive-wages-service
          // re-derives it from rateId server-side; trusting a client-
          // supplied amount here would be exactly the privilege escalation
          // that field's removal closes.
          eligibilityStatus: 'ELIGIBLE',
          calculatedAt: now.toISOString(),
        }),
      });
    } catch {
      throw badGateway('Unable to trigger the incentive — incentive-wages-service is unreachable.');
    }

    if (!res.ok) {
      if (res.status >= 400 && res.status < 500) {
        const body = (await res.json().catch(() => null)) as { message?: string } | null;
        throw new HttpError(res.status, body?.message ?? 'Unable to trigger the incentive.');
      }
      throw badGateway(
        'Unable to trigger the incentive — incentive-wages-service returned an error.',
      );
    }
  }
}
