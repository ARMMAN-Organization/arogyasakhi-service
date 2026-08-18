import { Router } from 'express';
import {
  asyncHandler,
  forbidden,
  notFound,
  ok,
  requireRoles,
  unauthorized,
  type AuthenticatedUser,
  type TokenSigner,
} from '@armman/service-commons';
import { authenticateGateway, degrade, fetchJson } from './dashboard-http.helpers';

export { authenticateGateway, degrade, fetchJson, postJson } from './dashboard-http.helpers';

// Read directly from process.env (not appConfig) — importing appConfig would
// pull in its full Zod schema (requires JWT_PUBLIC_KEY etc. with no
// defaults), which process.exit(1)s at module-load time in any test that
// never otherwise loads config. Matches beneficiary-service's
// geography.client.ts/sakhi.client.ts convention.
const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:3002';
const BENEFICIARY_SERVICE_URL = process.env.BENEFICIARY_SERVICE_URL ?? 'http://localhost:3001';
const VISIT_FORM_SERVICE_URL = process.env.VISIT_FORM_SERVICE_URL ?? 'http://localhost:3003';
const RISK_REFERRAL_SERVICE_URL = process.env.RISK_REFERRAL_SERVICE_URL ?? 'http://localhost:3005';
const SYNC_SERVICE_URL = process.env.SYNC_SERVICE_URL ?? 'http://localhost:3010';

interface ApiSakhi {
  sakhiId: string;
  displayName: string;
  supervisorId: string | null;
}

interface RegistrationSummary {
  totalActiveBeneficiaries: number;
  activeMothersCount: number;
  activeChildrenCount: number;
  activeMothersHighRiskCount: number;
  activeChildrenHighRiskCount: number;
  activeMothersPercent: number;
  activeChildrenPercent: number;
}

interface ReferralSummary {
  accompaniedReferralsCount: number;
  pendingFollowUpsCount: number;
}

interface VisitSummary {
  total: number;
  byStatus: Record<string, number>;
  endingSoonVisitsCount: number;
}

interface LastSynced {
  lastSyncedAt: string | null;
}

/**
 * Resolves the Sakhi's own record (identity anchor of the whole dashboard)
 * and enforces the same self/roster/unrestricted scoping as auth-service's
 * own GET /sakhis/:sakhiId — SAKHI may only view their own dashboard,
 * SUPERVISOR only a Sakhi in their own roster, MANAGER/ADMIN unrestricted.
 * A missing Sakhi hard-fails the whole request (404) — unlike the summary
 * sub-calls below, there is no meaningful "degraded" dashboard for a Sakhi
 * that doesn't exist.
 */
export async function resolveSakhiAndAuthorize(
  sakhiId: string,
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Promise<ApiSakhi> {
  const url = `${AUTH_SERVICE_URL}/api/v1/sakhis/${sakhiId}`;
  const res = await fetch(url, { headers: { Authorization: authorizationHeader } });
  if (res.status === 404) throw notFound('Sakhi not found.');
  if (res.status === 401) throw unauthorized();
  if (res.status === 403) {
    // auth-service's own GET /sakhis/:sakhiId scoping rejected the caller
    // (e.g. a SAKHI whose id isn't sakhiId) before this route's own
    // roster/self checks below even run — forward its message/status as-is
    // rather than masking a legitimate 403 as a 500.
    const body = (await res.json().catch(() => null)) as { message?: string } | null;
    throw forbidden(body?.message ?? 'You do not have access to this Sakhi.');
  }
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  const body = (await res.json()) as { data: ApiSakhi };
  const sakhi = body.data;

  if (caller.roles.includes('SAKHI') && caller.id !== sakhiId) {
    throw forbidden('A Sakhi may only view their own dashboard.');
  }
  if (caller.roles.includes('SUPERVISOR') && sakhi.supervisorId !== caller.id) {
    throw forbidden("This Sakhi is outside this Supervisor's roster.");
  }
  return sakhi;
}

/**
 * Aggregates the Sakhi dashboard from 4 services into one response for the
 * mobile app (see DashboardApi.kt/DashboardModels.kt) — this is a BFF-style
 * route, not a proxy mount, since it fans out to multiple downstream calls
 * and merges the results (a plain proxy forwards one request to one
 * service). The gateway holds no domain data of its own; every field here
 * is sourced from a downstream service call.
 */
export function createDashboardRouter(signer: Pick<TokenSigner, 'verify'>): Router {
  const router = Router();

  router.get(
    '/sakhi/:sakhiId/dashboard',
    authenticateGateway(signer),
    requireRoles('SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'),
    asyncHandler(async (req, res) => {
      const { sakhiId } = req.params;
      const caller = req.user as AuthenticatedUser;
      const authorizationHeader = req.header('authorization') as string;

      const sakhi = await resolveSakhiAndAuthorize(sakhiId, caller, authorizationHeader);

      const [beneficiarySummary, referralSummary, visitSummary, lastSynced] = await Promise.all([
        degrade(
          'beneficiary registration-summary',
          fetchJson<RegistrationSummary>(
            `${BENEFICIARY_SERVICE_URL}/api/v1/beneficiaries/registration-summary?sakhiId=${sakhiId}`,
            caller,
            authorizationHeader,
          ),
        ),
        degrade(
          'referral referral-summary',
          fetchJson<ReferralSummary>(
            `${RISK_REFERRAL_SERVICE_URL}/api/v1/referrals/referral-summary?sakhiId=${sakhiId}`,
            caller,
            authorizationHeader,
          ),
        ),
        degrade(
          'visit visit-summary',
          fetchJson<VisitSummary>(
            `${VISIT_FORM_SERVICE_URL}/api/v1/visits/visit-summary?sakhiId=${sakhiId}`,
            caller,
            authorizationHeader,
          ),
        ),
        degrade(
          'sync last-synced',
          fetchJson<LastSynced>(
            `${SYNC_SERVICE_URL}/api/v1/sync/last-synced?userId=${sakhiId}`,
            caller,
            authorizationHeader,
          ),
        ),
      ]);

      res.json(
        ok({
          sakhi: { id: sakhi.sakhiId, name: sakhi.displayName },
          lastSyncedAt: lastSynced?.lastSyncedAt ?? null,
          beneficiarySummary: beneficiarySummary
            ? {
                totalActiveBeneficiaries: beneficiarySummary.totalActiveBeneficiaries,
                activeMothersCount: beneficiarySummary.activeMothersCount,
                activeChildrenCount: beneficiarySummary.activeChildrenCount,
                activeMothersHighRiskCount: beneficiarySummary.activeMothersHighRiskCount,
                activeChildrenHighRiskCount: beneficiarySummary.activeChildrenHighRiskCount,
                activeMothersPercent: beneficiarySummary.activeMothersPercent,
                activeChildrenPercent: beneficiarySummary.activeChildrenPercent,
              }
            : null,
          referralSummary: referralSummary
            ? {
                accompaniedReferralsCount: referralSummary.accompaniedReferralsCount,
                pendingFollowUpsCount: referralSummary.pendingFollowUpsCount,
              }
            : null,
          // dueVisitsCount/overdueVisitsCount map onto visit-form-service's
          // VISIT_STATUS lookup codes (STARTED/PENDING/MISSED/COMPLETED) —
          // there is no separate DUE/OVERDUE status. PENDING (scheduled, not
          // yet started) is the closest match for "due"; MISSED (scheduled
          // date passed, never started) for "overdue".
          visitSummary: visitSummary
            ? {
                dueVisitsCount: visitSummary.byStatus['PENDING'] ?? 0,
                overdueVisitsCount: visitSummary.byStatus['MISSED'] ?? 0,
                endingSoonVisitsCount: visitSummary.endingSoonVisitsCount,
              }
            : null,
        }),
      );
    }),
  );

  return router;
}
