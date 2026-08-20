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
  { prefix: '/project-geography', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  // Flat Sakhi roster download for offline reference — distinct from
  // /projects/:id/sakhis (an assignment list), for the Beneficiary Data
  // Download screen.
  { prefix: '/arogya-sakhi-roster', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/registration-targets', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  // App-wide config key/value store (sync interval, min app version, etc.) —
  // the Supervisor app's Download Master Data "Application Parameter" row.
  { prefix: '/application-parameters', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  // Dedicated-path aliases for /lookups/:categoryCode — same data, same
  // service, just a fixed categoryCode per path (see master-data-alias.routes.ts).
  { prefix: '/risk-categories', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/risk-types', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/risk-languages', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/visit-categories', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/item-categories', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/uom-list', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/transaction-types', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/gathering-statuses', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/gathering-types', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  { prefix: '/ddl-items', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  // Sakhi profile reads (list under a project, single lookup) — used by the
  // Supervisor's Sakhi picker/detail header on inventory/meeting screens.
  { prefix: '/sakhis', target: appConfig.AUTH_SERVICE_URL, requiresAuth: true },
  // NOTE: `/docs` is NOT proxied here. The gateway serves ONE aggregated
  // Swagger UI at `/api/v1/docs` (see docs/docs.controller.ts) that merges
  // every service's own `/docs.json` into a single page — there is no single
  // downstream service to proxy a bare `/docs` to, and per-service pages were
  // replaced by the unified view.
  // These three MUST be registered before the generic '/beneficiaries' entry
  // below — Express matches app.use() mounts in registration order, and the
  // first matching prefix wins (the proxy middleware never calls next()).
  // Each is more specific than '/beneficiaries' alone (a literal trailing
  // segment — /risk, /risk-referrals, /visits — that '/beneficiaries' by
  // itself doesn't have), so putting them first routes exactly those
  // sub-paths to their owning service while every other /beneficiaries/*
  // request still falls through to beneficiary-service unaffected.
  {
    prefix: '/beneficiaries/:beneficiaryId/risk',
    target: appConfig.RISK_REFERRAL_SERVICE_URL,
    requiresAuth: true,
  },
  // Covers both the header list and its /risk-referrals/:referralId/details
  // sub-path — one mount, same target service for both.
  {
    prefix: '/beneficiaries/:beneficiaryId/risk-referrals',
    target: appConfig.RISK_REFERRAL_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/beneficiaries/:beneficiaryId/visits',
    target: appConfig.VISIT_FORM_SERVICE_URL,
    requiresAuth: true,
  },
  // GET /beneficiaries/:beneficiaryId/latest-visit-vitals — owned by
  // visit-form-service (it owns form_submissions/visit_instances), not
  // beneficiary-service, which calls this same route itself server-to-
  // server (via visitVitals.client.ts) to enrich GET /beneficiaries/:id.
  {
    prefix: '/beneficiaries/:beneficiaryId/latest-visit-vitals',
    target: appConfig.VISIT_FORM_SERVICE_URL,
    requiresAuth: true,
  },
  { prefix: '/beneficiaries', target: appConfig.BENEFICIARY_SERVICE_URL, requiresAuth: true },
  // UNCONFIRMED alias for GET /beneficiaries/risk-summary — see the route's
  // own doc comment in beneficiary.routes.ts for why this is a best guess.
  { prefix: '/risk-monitoring', target: appConfig.BENEFICIARY_SERVICE_URL, requiresAuth: true },
  { prefix: '/visits', target: appConfig.VISIT_FORM_SERVICE_URL, requiresAuth: true },
  { prefix: '/visit-schedules', target: appConfig.VISIT_FORM_SERVICE_URL, requiresAuth: true },
  // Visit-type reference catalog (SRS Appendix A/B) — the Supervisor app's
  // Download Master Data "Visit Master" row. Owned by visit-form-service
  // (not auth-service) since it already owns VisitSchedule/VisitCodeType.
  { prefix: '/visit-masters', target: appConfig.VISIT_FORM_SERVICE_URL, requiresAuth: true },
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
  // Internal-use endpoint, not part of a human-facing surface —
  // visit-form-service calls it through the gateway after persisting a
  // visit-linked submission, to trigger the risk-grading pipeline.
  { prefix: '/risk-assessments', target: appConfig.RISK_REFERRAL_SERVICE_URL, requiresAuth: true },
  // Risk condition master-data read (batch code lookup, or a full
  // download with no conditionCode filter) — was missing here despite
  // being implemented downstream, so it 404'd at the gateway.
  { prefix: '/risk-conditions', target: appConfig.RISK_REFERRAL_SERVICE_URL, requiresAuth: true },
  // Dedicated-path alias for /risk-conditions — same data, same service.
  { prefix: '/risk-parameters', target: appConfig.RISK_REFERRAL_SERVICE_URL, requiresAuth: true },
  { prefix: '/closures', target: appConfig.CLOSURE_REOPEN_SERVICE_URL, requiresAuth: true },
  // Internal-use decision endpoint, not part of the public Quick Response
  // surface — approval-service calls it through the gateway (rather than
  // closure-reopen-service's own port directly) because it uses
  // trustGatewayIdentity, which only trusts the gateway's verified
  // x-armman-* headers, not a raw forwarded JWT.
  { prefix: '/reopen-requests', target: appConfig.CLOSURE_REOPEN_SERVICE_URL, requiresAuth: true },
  { prefix: '/approvals', target: appConfig.APPROVAL_SERVICE_URL, requiresAuth: true },
  { prefix: '/quick-response', target: appConfig.APPROVAL_SERVICE_URL, requiresAuth: true },
  { prefix: '/incentives', target: appConfig.INCENTIVE_WAGES_SERVICE_URL, requiresAuth: true },
  {
    prefix: '/incentive-rates',
    target: appConfig.INCENTIVE_WAGES_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/notifications',
    target: appConfig.NOTIFICATION_ESCALATION_SERVICE_URL,
    requiresAuth: true,
  },
  // Internal-use Quick Response read surface, not documented as a public
  // API — approval-service calls it through the gateway for the same
  // trustGatewayIdentity reason as /reopen-requests above.
  {
    prefix: '/escalation-events',
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
  // Dedicated-path alias for /inventory-items — same data, same service.
  {
    prefix: '/item-master-list',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/inventory-transactions',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  // Dedicated-path alias for GET /inventory-transactions/:id — same service.
  {
    prefix: '/item-transactions',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/call-logs',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  // Dedicated-path alias for GET /call-logs/by-sakhi/:sakhiId — same service.
  {
    prefix: '/sakhi-calls',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
  {
    prefix: '/call-sheet-stats',
    target: appConfig.SUPERVISOR_OPERATIONS_SERVICE_URL,
    requiresAuth: true,
  },
];
