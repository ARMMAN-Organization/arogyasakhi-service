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
  /** Path prefix exposed to clients, e.g. `/beneficiaries` → `/api/v1/beneficiaries/...`. */
  readonly prefix: string;
  /** Base URL of the downstream service (host only — path is preserved). */
  readonly target: string;
  /**
   * Whether the gateway must verify a bearer token before proxying this
   * prefix. `false` only for the small set of routes that must be reachable
   * without a token (login, refresh — you cannot require a token to obtain
   * one). All routes on a service still enforce per-route roles themselves
   * via `requireRoles(...)`, trusting the identity the gateway forwards.
   */
  readonly requiresAuth: boolean;
  /**
   * Additional exact paths (under the gateway's `api/v1` prefix) to mount the
   * same proxy on, alongside `prefix`. Needed for sibling routes that don't
   * live under `prefix/*` — e.g. `/docs.json` sits next to `/docs`, not under it.
   */
  readonly extraMountPaths?: readonly string[];
  /**
   * Downstream path to rewrite `prefix` (and each `extraMountPaths` entry) to,
   * when it differs from the gateway-facing path. Omit when the gateway path
   * and downstream path are identical (the common case).
   */
  readonly downstreamPrefix?: string;
}

export const SERVICE_ROUTES: readonly ServiceRoute[] = [
  // auth-service's /auth/login and /auth/refresh are unauthenticated by
  // nature; /auth/logout and /me require a token, but auth-service itself
  // enforces that check — the gateway leaves the whole prefix unauthenticated
  // rather than parsing which /auth/* sub-path needs a token.
  { prefix: '/auth', target: appConfig.AUTH_SERVICE_URL, requiresAuth: false },
  { prefix: '/me', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  // auth-service also owns user + project/funder + lookup master-data routes.
  // Each enforces its own role guard downstream (requireRoles), so the gateway
  // just needs to verify a token and forward — without these entries the
  // endpoints return a gateway 404 despite appearing in the aggregated docs.
  { prefix: '/users', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/projects', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/funders', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/lookups', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/geography-units', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/master-data', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  // Sakhi profile reads (list under a project, single lookup) — used by the
  // Supervisor's Sakhi picker/detail header on inventory/meeting screens.
  { prefix: '/sakhis', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  // NOTE: `/docs` is NOT proxied here. The gateway serves ONE aggregated
  // Swagger UI at `/api/v1/docs` (see docs/docs.controller.ts) that merges
  // every service's own `/docs.json` into a single page — there is no single
  // downstream service to proxy a bare `/docs` to, and per-service pages were
  // replaced by the unified view.
  { prefix: '/beneficiaries', target: appConfig.BENEFICIARY_SERVICE_URL, requiresAuth: true },
  { prefix: '/visits', target: appConfig.VISIT_FORM_SERVICE_URL, requiresAuth: true },
  { prefix: '/forms', target: appConfig.VISIT_FORM_SERVICE_URL, requiresAuth: true },
  // Admin form-authoring routes (create/patch/publish draft versions) live
  // under /admin/forms in visit-form-service — a distinct prefix from /forms,
  // so it needs its own gateway entry or those 3 endpoints are unreachable.
  { prefix: '/admin/forms', target: appConfig.VISIT_FORM_SERVICE_URL, requiresAuth: true },
  { prefix: '/rules', target: appConfig.RULES_SERVICE_URL, requiresAuth: true },
  // Admin rule-pack version routes (get current published version, publish a
  // new version) live under /admin/rules in rules-service — a distinct prefix
  // from /rules, so it needs its own gateway entry (mirrors /admin/forms).
  { prefix: '/admin/rules', target: appConfig.RULES_SERVICE_URL, requiresAuth: true },
  { prefix: '/referrals', target: appConfig.RISK_REFERRAL_SERVICE_URL, requiresAuth: true },
  { prefix: '/closures', target: appConfig.CLOSURE_REOPEN_SERVICE_URL, requiresAuth: true },
  { prefix: '/approvals', target: appConfig.APPROVAL_SERVICE_URL, requiresAuth: true },
  // Quick Response's client-facing surface — merges approval_requests with
  // escalation_events server-side. The two source-service prefixes
  // (/escalation-events on notification-escalation-service,
  // /reopen-requests on closure-reopen-service) are called directly by
  // approval-service, not routed through the gateway — same
  // service-to-service pattern as supervisor-operations-service's
  // SakhiClient calling auth-service's /sakhis/:id.
  { prefix: '/quick-response', target: appConfig.APPROVAL_SERVICE_URL, requiresAuth: true },
  { prefix: '/incentives', target: appConfig.INCENTIVE_WAGES_SERVICE_URL, requiresAuth: true },
  {
    prefix: '/notifications',
    target: appConfig.NOTIFICATION_ESCALATION_SERVICE_URL,
    requiresAuth: true,
  },
  { prefix: '/sync', target: appConfig.SYNC_SERVICE_URL, requiresAuth: true },
  { prefix: '/media', target: appConfig.MEDIA_SERVICE_URL, requiresAuth: true },
  { prefix: '/audit', target: appConfig.AUDIT_SERVICE_URL, requiresAuth: true },
  // supervisor-operations-service owns six sibling prefixes (events,
  // Training sessions under /gatherings, training topics, inventory
  // items/transactions, call logs). Each enforces its own role guard
  // downstream.
  {
    prefix: '/supervisor-events',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  // Real per-session ("gathering") resource, distinct from
  // supervisor_events — a TRAINING event can have multiple gatherings,
  // each with its own topics/attendance/marks.
  {
    prefix: '/gatherings',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/training-topics',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/topics',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/inventory-items',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/inventory-transactions',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/call-logs',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/call-sheet-stats',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
];
