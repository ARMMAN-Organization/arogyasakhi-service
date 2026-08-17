import { Router, type RequestHandler } from 'express';
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
 * Minimal Bearer-token verification for this gateway-side route only — a
 * local copy of service-commons' `authenticate()`, not a reuse of it: that
 * function's parameter type is the full `TokenSigner` (sign + verify), but
 * the gateway only ever holds a verify-only `PublicKeyVerifier` (it never
 * issues tokens — see main.ts). `authenticate()` never calls `.sign()` at
 * runtime, so this narrows the same logic to the verify-only shape instead
 * of an unsafe cast to satisfy the wider type.
 */
export function authenticateGateway(signer: Pick<TokenSigner, 'verify'>): RequestHandler {
  return (req, _res, next) => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return next(unauthorized());
    const token = header.slice('Bearer '.length).trim();
    if (!token) return next(unauthorized());

    signer
      .verify(token)
      .then((payload) => {
        req.user = {
          id: String(payload.sub),
          roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
          projectId: typeof payload.projectId === 'string' ? payload.projectId : null,
          geographyUnitId:
            typeof payload.geographyUnitId === 'string' ? payload.geographyUnitId : null,
        };
        next();
      })
      .catch(() => next(unauthorized('Invalid or expired token.')));
  };
}

const TRUSTED_USER_ID_HEADER = 'x-armman-user-id';
const TRUSTED_ROLES_HEADER = 'x-armman-roles';
const TRUSTED_PROJECT_ID_HEADER = 'x-armman-project-id';
const TRUSTED_GEOGRAPHY_UNIT_ID_HEADER = 'x-armman-geography-unit-id';

/**
 * The same trusted-identity headers `verifyAndForwardIdentity` sets when
 * proxying to a downstream service — duplicated here (not imported from
 * service-commons) because this route calls beneficiary-service/
 * visit-form-service/risk-referral-service/sync-service directly via
 * fetch(), not through the gateway's own proxy layer, so those headers are
 * never set automatically. Every one of those services gates its routes
 * with `trustGatewayIdentity`, which reads these headers — but several of
 * their own controllers (e.g. beneficiary-service's) ALSO independently
 * require the original `Authorization: Bearer` header to still be present
 * (used for their own onward calls to auth-service, e.g. resolving a
 * Supervisor's roster) even though `trustGatewayIdentity` never reads it.
 * `verifyAndForwardIdentity`'s real proxy path forwards both the trusted
 * headers AND the original Authorization header unchanged (it only adds
 * headers, never strips), so both must be sent here too — trusted headers
 * alone 401 at the controller layer despite passing trustGatewayIdentity/
 * requireRoles.
 */
function trustedIdentityHeaders(
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Record<string, string> {
  return {
    Authorization: authorizationHeader,
    [TRUSTED_USER_ID_HEADER]: caller.id,
    [TRUSTED_ROLES_HEADER]: caller.roles.join(','),
    [TRUSTED_PROJECT_ID_HEADER]: caller.projectId ?? '',
    [TRUSTED_GEOGRAPHY_UNIT_ID_HEADER]: caller.geographyUnitId ?? '',
  };
}

export async function fetchJson<T>(
  url: string,
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Promise<T> {
  const res = await fetch(url, { headers: trustedIdentityHeaders(caller, authorizationHeader) });
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status}`);
  }
  const body = (await res.json()) as { data: T };
  return body.data;
}

/** Same as fetchJson but POSTs a JSON body — for the count-by-beneficiary
 * endpoints, which take a (potentially large) beneficiaryIds list that
 * doesn't fit safely in a query string. */
export async function postJson<T>(
  url: string,
  body: unknown,
  caller: AuthenticatedUser,
  authorizationHeader: string,
): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      ...trustedIdentityHeaders(caller, authorizationHeader),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`${url} responded ${res.status}`);
  }
  const responseBody = (await res.json()) as { data: T };
  return responseBody.data;
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
 * Awaits a downstream summary call and returns its value, or `null` on any
 * failure — graceful degradation per the agreed dashboard contract: one
 * failing summary service must not take down the whole dashboard. Logs the
 * failure so a silently-null section is still visible in server logs.
 */
export async function degrade<T>(label: string, promise: Promise<T>): Promise<T | null> {
  try {
    return await promise;
  } catch (err) {
    console.error(`Sakhi dashboard: ${label} failed — degrading to null.`, err);
    return null;
  }
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
            `${RISK_REFERRAL_SERVICE_URL}/api/v1/referrals/referral-summary`,
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
