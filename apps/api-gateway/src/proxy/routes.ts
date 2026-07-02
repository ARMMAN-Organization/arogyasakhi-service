import { appConfig } from '../config/app-config';

/**
 * Routing table: maps a public path prefix (under the gateway's `api/v1`
 * global prefix) to the downstream service that owns it.
 *
 * The gateway knows only the service's *URL* — never its code. Downstream
 * services keep the same `api/v1` prefix, so the path is forwarded unchanged.
 *
 * To expose a new service, add a row here and a matching URL in `app-config`.
 * No other gateway change is required.
 */
export interface ServiceRoute {
  /** Path prefix exposed to clients, e.g. `/sessions` → `/api/v1/sessions/...`. */
  readonly prefix: string;
  /** Base URL of the downstream service (host only — path is preserved). */
  readonly target: string;
}

export const SERVICE_ROUTES: readonly ServiceRoute[] = [
  { prefix: '/sessions', target: appConfig.AUTH_SERVICE_URL },
  { prefix: '/beneficiaries', target: appConfig.BENEFICIARY_SERVICE_URL },
  { prefix: '/visits', target: appConfig.VISIT_FORM_SERVICE_URL },
  { prefix: '/rules', target: appConfig.RULES_SERVICE_URL },
  { prefix: '/referrals', target: appConfig.RISK_REFERRAL_SERVICE_URL },
  { prefix: '/closures', target: appConfig.CLOSURE_REOPEN_SERVICE_URL },
  { prefix: '/approvals', target: appConfig.APPROVAL_SERVICE_URL },
  { prefix: '/incentives', target: appConfig.INCENTIVE_WAGES_SERVICE_URL },
  { prefix: '/notifications', target: appConfig.NOTIFICATION_ESCALATION_SERVICE_URL },
  { prefix: '/sync', target: appConfig.SYNC_SERVICE_URL },
  { prefix: '/media', target: appConfig.MEDIA_SERVICE_URL },
  { prefix: '/audit', target: appConfig.AUDIT_SERVICE_URL },
];
