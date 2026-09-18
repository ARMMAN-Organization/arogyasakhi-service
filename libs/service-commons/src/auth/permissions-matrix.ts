/**
 * Single source of truth for which roles may call which route, across every
 * service — a static mirror of the ~140 `requireRoles(...)` call sites
 * scattered one-per-route across this monorepo (security/QA verification
 * follow-up: there was no central place to audit "what can a SUPERVISOR do"
 * without grepping every service). This file does not enforce anything by
 * itself — routes still call `requireRoles(...)` directly — it exists so
 * that enforcement can be audited/reviewed in one place, and so
 * permissions-matrix.spec.ts's drift check can catch a route whose
 * `requireRoles(...)` call was added/changed without updating this list.
 *
 * `roles: []` mirrors `requireRoles()` called with zero arguments — any
 * authenticated caller, regardless of role.
 */
export interface RoutePermission {
  readonly service: string;
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly roles: readonly string[];
}

export const PERMISSIONS_MATRIX: readonly RoutePermission[] = [
  // visit-form-service
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/form-submissions',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'POST',
    path: '/admin/forms/:formCode/versions',
    roles: ['ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'PATCH',
    path: '/admin/forms/:formCode/versions/:versionId',
    roles: ['ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'POST',
    path: '/admin/forms/:formCode/versions/:versionId/publish',
    roles: ['ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/latest-visit-vitals',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/submissions',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/delivery-outcomes',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'visit-form-service',
    method: 'PATCH',
    path: '/form-submissions/:id/answers',
    roles: ['SAKHI'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/visits',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/visits/visit-summary',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/visits',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/mis-summary',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/visit-history',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'POST',
    path: '/visits/count-by-beneficiary',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'POST',
    path: '/visits/by-pada',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  { service: 'visit-form-service', method: 'POST', path: '/visits', roles: ['SAKHI'] },
  {
    service: 'visit-form-service',
    method: 'PATCH',
    path: '/visits/restore',
    roles: ['SUPERVISOR', 'SYSTEM', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/visits/:id',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/visits/:id/mis-summary',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'PATCH',
    path: '/visits/:id',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'GET',
    path: '/visit-schedules',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'visit-form-service',
    method: 'POST',
    path: '/visit-schedules/bulk',
    roles: ['SAKHI', 'SUPERVISOR'],
  },
  {
    service: 'visit-form-service',
    method: 'POST',
    path: '/visit-schedules/generate',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },

  // beneficiary-service
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/full-detail',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/ids',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/pada-breakdown',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/by-ids-with-risk',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/risk-condition-summary',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/registration-summary',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/risk-summary',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/risk-monitoring',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/internal/post-edd-pending',
    roles: ['SYSTEM'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/:id',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'SYSTEM'],
  },
  {
    service: 'beneficiary-service',
    method: 'GET',
    path: '/beneficiaries/:id/ownership',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  { service: 'beneficiary-service', method: 'POST', path: '/beneficiaries', roles: ['SAKHI'] },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/:id/socio-demographics',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/:id/lmp',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/:id/phase',
    roles: ['SAKHI'],
  },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/:id/ccv-opening-risk-state',
    roles: ['SAKHI'],
  },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/:id/close',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/:id/risk-condition-summary',
    roles: ['SAKHI'],
  },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/:id/reactivate',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/restore',
    roles: ['SUPERVISOR', 'SYSTEM', 'ADMIN'],
  },
  {
    service: 'beneficiary-service',
    method: 'PATCH',
    path: '/beneficiaries/:id/transfer',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },

  // risk-referral-service
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/risk-referrals',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/risk-referrals/:referralId/details',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/risk',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/beneficiaries/:beneficiaryId/risk-state',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'POST',
    path: '/risk-assessments',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/risk-assessments',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/risk/by-sakhi/:sakhiId',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/referrals',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/risk-referrals',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/referrals/referral-summary',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/referrals/decision-status',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'GET',
    path: '/referrals/:id',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'POST',
    path: '/referrals/pending-followups-by-beneficiary',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'POST',
    path: '/referrals/followups-by-beneficiary',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  { service: 'risk-referral-service', method: 'POST', path: '/referrals', roles: ['SAKHI'] },
  {
    service: 'risk-referral-service',
    method: 'PATCH',
    path: '/referrals/:id/decision',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'risk-referral-service',
    method: 'POST',
    path: '/referrals/:id/decision',
    roles: ['SUPERVISOR'],
  },
  {
    service: 'risk-referral-service',
    method: 'POST',
    path: '/referrals/:id/follow-up',
    roles: ['SAKHI'],
  },
  {
    service: 'risk-referral-service',
    method: 'PATCH',
    path: '/referrals/:id/convert',
    roles: ['SAKHI'],
  },

  // media-service
  {
    service: 'media-service',
    method: 'GET',
    path: '/media',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'media-service',
    method: 'GET',
    path: '/media/:id',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'media-service',
    method: 'POST',
    path: '/media/upload-url',
    roles: ['SAKHI', 'SUPERVISOR'],
  },
  { service: 'media-service', method: 'POST', path: '/media', roles: ['SAKHI', 'SUPERVISOR'] },

  // cms-content-service
  {
    service: 'cms-content-service',
    method: 'GET',
    path: '/learn-more/sections',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'cms-content-service',
    method: 'GET',
    path: '/learn-more/sections/:sectionCode/topics',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'cms-content-service',
    method: 'GET',
    path: '/learn-more/topics/:topicCode',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  { service: 'cms-content-service', method: 'POST', path: '/learn-more/sync', roles: ['ADMIN'] },
  {
    service: 'cms-content-service',
    method: 'GET',
    path: '/health-education/messages',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'cms-content-service',
    method: 'PATCH',
    path: '/health-education/messages/:id',
    roles: ['ADMIN'],
  },
  {
    service: 'cms-content-service',
    method: 'POST',
    path: '/health-education/media-sync',
    roles: ['ADMIN'],
  },

  // approval-service
  {
    service: 'approval-service',
    method: 'GET',
    path: '/quick-response',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'approval-service',
    method: 'GET',
    path: '/quick-response/details',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'approval-service',
    method: 'GET',
    path: '/quick-response/:cardId',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'approval-service',
    method: 'POST',
    path: '/quick-response/:cardId/decision',
    roles: ['SUPERVISOR'],
  },
  {
    service: 'approval-service',
    method: 'GET',
    path: '/approvals',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'approval-service',
    method: 'GET',
    path: '/approvals/by-source',
    roles: ['SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'approval-service',
    method: 'POST',
    path: '/approvals',
    roles: ['SAKHI', 'SUPERVISOR'],
  },
  {
    service: 'approval-service',
    method: 'POST',
    path: '/lmp-change-requests',
    roles: ['SAKHI'],
  },
  {
    service: 'approval-service',
    method: 'GET',
    path: '/lmp-change-requests',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER'],
  },
  {
    service: 'approval-service',
    method: 'GET',
    path: '/lmp-change-requests/:id',
    roles: ['SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'approval-service',
    method: 'POST',
    path: '/lmp-change-requests/:id/decision',
    roles: ['SUPERVISOR'],
  },

  // api-gateway
  {
    service: 'api-gateway',
    method: 'GET',
    path: '/sakhi/:sakhiId/padas',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'api-gateway',
    method: 'GET',
    path: '/sakhi/:sakhiId/dashboard',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },
  {
    service: 'api-gateway',
    method: 'GET',
    path: '/padas/:padaId/visits',
    roles: ['SAKHI', 'SUPERVISOR', 'MANAGER', 'ADMIN'],
  },

  // audit-service
  { service: 'audit-service', method: 'GET', path: '/audit', roles: ['ADMIN', 'MANAGER'] },
  {
    service: 'audit-service',
    method: 'POST',
    path: '/audit',
    roles: ['ADMIN', 'SUPERVISOR', 'SAKHI', 'SYSTEM'],
  },
  { service: 'audit-service', method: 'POST', path: '/analytics-events', roles: ['SAKHI'] },
  {
    service: 'audit-service',
    method: 'GET',
    path: '/analytics-events/:id',
    roles: ['SYSTEM'],
  },
] as const;

/**
 * KNOWN INCOMPLETE — this matrix currently covers visit-form-service,
 * beneficiary-service, risk-referral-service, media-service,
 * cms-content-service, approval-service, api-gateway, and audit-service.
 * Not yet enumerated: supervisor-operations-service, incentive-wages-service,
 * auth-service, closure-reopen-service, sync-service, rules-service,
 * notification-escalation-service. permissions-matrix.spec.ts's drift check
 * only compares `requireRoles(...)` call sites in the services listed in
 * {@link COVERED_SERVICES} against this matrix — it will NOT catch missing
 * rows for an uncovered service. Extending `COVERED_SERVICES` (and adding
 * that service's rows above) is tracked as a follow-up.
 */
export const COVERED_SERVICES: readonly string[] = [
  'visit-form-service',
  'beneficiary-service',
  'risk-referral-service',
  'media-service',
  'cms-content-service',
  'approval-service',
  'api-gateway',
  'audit-service',
];
