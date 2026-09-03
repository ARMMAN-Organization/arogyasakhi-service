# Plan: LMP Contract, Referral Decision Persistence, Audit Write Path, Non-Approval Edits

Date: 2026-09-02
Branch: feature/cr-lmp-referral-audit-backend

## Context

Backend investigation (2026-09-01/02, verified against code) found 4 concrete gaps blocking
the Sakhi mobile frontend's LMP-editing, Referral Follow-up, audit-trail, and non-approval-edit
work. This plan closes all 4. Out of scope: the LMP→risk-calc correctness bug (separate
rules-service/risk-referral-service ticket) and the SAKHI-facing audit *read* endpoint
(open product decision, not decided here).

## Global Constraints

- Follow existing repo conventions exactly: TypeScript strict, zod `.strict()` DTOs validated
  via `validateBody`/`validate` middleware, Express routers via `createDocumentedRouter()`,
  standard `{ success, message, data }` / `{ success, message, errorCode, details }` envelope,
  Prisma migrations checked into `prisma/migrations/`, Jest `*.spec.ts` beside code.
- Idempotency pattern to mirror exactly (from `apps/closure-reopen-service/src/reopen-requests/`):
  a nullable-but-unique Prisma string column + pre-check by that column + catch P2002 (via a
  local `isUniqueConstraintViolation`/`isPrismaErrorCode` helper, each service has its own) +
  re-query and return the winning row. Do not build a shared library helper — every existing
  service re-implements this locally; match that.
- Audit-client pattern to mirror exactly (from `apps/closure-reopen-service/src/reopen-requests/audit.client.ts`):
  a small class with a `log(actorUserId, action, entityType, entityId, afterJson, authorizationHeader)`
  method that does `fetch(`${appConfig.API_GATEWAY_BASE_URL}/api/v1/audit`, { method: 'POST', ... })`,
  throwing `badGateway` on failure. The CALLER wraps it in try/catch to log-and-continue
  (best-effort) — the client itself does not swallow errors.
- Every new/modified route needs role guards via `requireRoles(...)` from `service-commons`,
  and `trustGatewayIdentity` first in the middleware chain, matching every existing route in
  the touched files.
- Every new endpoint needs an OpenAPI `summary`/`responses` block, matching the existing style
  in the same routes file (see `referralFollowup.controller.ts` or `lmp-change-request.routes.ts`
  for the exact shape expected).

## Task 1 — approval-service: LMP_CHANGE creation endpoint + idempotency + beneficiary-scoped list

**Files:**
- New: `apps/approval-service/src/lmp-change-requests/dto/create-lmpChangeRequest.dto.ts`
- New: `apps/approval-service/prisma/migrations/<timestamp>_add_approval_request_local_uuid/migration.sql`
  (or via `npx prisma migrate dev` — whichever this repo's convention is; check existing
  migration folder naming under `apps/approval-service/prisma/migrations/` and match it)
- Modify: `apps/approval-service/prisma/schema.prisma` — add to `model ApprovalRequest`:
  ```prisma
  localRequestUuid String? @unique @map("local_request_uuid") @db.VarChar(80)
  ```
  (nullable + unique, mirroring how `Referral.visitId` is nullable+unique via
  `@@unique([visitId], map: "visit_referral_once")` — use a named unique constraint the same way:
  `@@unique([localRequestUuid], map: "approval_request_local_uuid_once")` if Prisma requires
  the partial-unique-on-non-null semantics; otherwise a plain `@unique` on a nullable column
  works directly in Postgres/Prisma without a named map — check what `Referral.visitId` actually
  needed and copy that exact mechanism.)
- Modify: `apps/approval-service/src/lmp-change-requests/lmp-change-request.routes.ts` — add two
  new routes (see below). Existing `GET /lmp-change-requests/:id` and its decision route stay
  untouched.
- Modify or extend: `apps/approval-service/src/lmp-change-requests/lmp-change-request.service.ts`
  (find or create this file — check whether creation/decision logic for LMP already lives in a
  dedicated service file or inside `quick-response.service.ts`; if the latter, add the new
  create/list methods to a NEW `lmp-change-request.service.ts` file rather than growing
  `quick-response.service.ts` further, and wire it into `lmp-change-request.routes.ts`).
- New: `apps/approval-service/src/lmp-change-requests/dto/create-lmpChangeRequest.dto.spec.ts`
- New/extend: service spec file alongside the above.

**DTO shape** (`create-lmpChangeRequest.dto.ts`):
```ts
export const createLmpChangeRequestSchema = z.object({
  beneficiaryId: z.string().uuid(),
  newLmpDate: z.coerce.date(),
  sonographyImageAssetId: z.string().uuid().optional(),
  localRequestUuid: z.string().trim().min(1).max(80),
}).strict();
```

**Route 1 — `POST /lmp-change-requests`** (new, roles `SAKHI`):
- Validates body with the schema above.
- Idempotent create: pre-check `ApprovalRequest.findUnique({ where: { localRequestUuid } })`;
  if found, return it as-is (200, not 201). If not found, create a new `ApprovalRequest` row:
  `requestType: 'LMP_CHANGE'`, `beneficiaryId`, `sourceEntityType: 'BENEFICIARY'` (or whatever
  the existing convention is for this field on other request types — check how REOPEN or
  another existing request type populates `sourceEntityType`/`sourceEntityId` and mirror it),
  `requestedByUserId` from the authenticated caller, `requestPayloadJson: { newLmpDate: dto.newLmpDate.toISOString(), sonographyImageAssetId: dto.sonographyImageAssetId ?? null }`,
  `decisionStatusLookupId` set to whatever the existing PENDING-equivalent lookup value id is
  for approval requests (check how the generic `POST /approvals` route or REOPEN populates this
  today — do not invent a new lookup value).
  On unique-constraint race (P2002 on `localRequestUuid`), re-query and return the winner — same
  pattern as `reopen-request.service.ts` create().
- Response: 201 (new) or 200 (idempotent replay) with the standard envelope, `data` = the same
  shape as the existing `lmpChangeRequestDetailSchema` response (reuse it).

**Route 2 — `GET /lmp-change-requests`** (new, roles `SAKHI`, `SUPERVISOR`, `MANAGER`):
- Query schema: `{ beneficiaryId: z.string().uuid() }.strict()` — **`beneficiaryId` is REQUIRED**,
  not optional. Missing it → 400 `VALIDATION_ERROR`.
- Returns all `ApprovalRequest` rows where `requestType: 'LMP_CHANGE'` and `beneficiaryId` matches,
  most-recent-first, using the same detail-shape mapping as the existing `GET /lmp-change-requests/:id`
  handler (reuse that mapping function rather than duplicating it — extract it to a shared
  function in the service if it's currently inline in the controller/route handler).

**Tests required (mirror `reopen-request.service.spec.ts`'s idempotency test style):**
- DTO: valid body (with and without `sonographyImageAssetId`) passes; missing `beneficiaryId`/
  `newLmpDate`/`localRequestUuid` fails; invalid uuid fails; unknown extra field fails (`.strict()`).
- Service: create returns a new row with correct `requestPayloadJson`; calling create twice with
  the same `localRequestUuid` returns the SAME row both times (idempotent); two different
  `localRequestUuid`s for the same beneficiary create two distinct rows; simulated P2002 race
  resolves to the winner, not an error.
- Route/controller or integration test: `POST /lmp-change-requests` as SAKHI → 201; as SUPERVISOR
  or unauthenticated → 403/401; `GET /lmp-change-requests?beneficiaryId=X` as SAKHI → 200, only
  that beneficiary's rows; missing `beneficiaryId` query param → 400.

## Task 2 — risk-referral-service: Referral decision persistence + REFILL fix + beneficiary-scoped read

**Files:**
- New migration: `apps/risk-referral-service/prisma/migrations/<timestamp>_add_referral_decision_fields/`
- Modify: `apps/risk-referral-service/prisma/schema.prisma` — add to `model Referral`:
  ```prisma
  decidedByUserId String?   @map("decided_by_user_id")
  decidedAt       DateTime? @map("decided_at")
  decisionNotes   String?   @map("decision_notes")
  ```
- Modify: `apps/risk-referral-service/src/referrals/referral.service.ts` — in `decide()`
  (currently ~lines 244-296, with the REFILL short-circuit at ~274-280):
  - Remove the `if (dto.decision === 'REFILL') { return existing; }` early return.
  - For ALL three decisions (LAPSE, REFILL, COMPLETE), after the existing PENDING_FOLLOWUP
    guard and (for non-REFILL) the `assertDecisionMatchesReferralType` check, persist
    `decidedByUserId` (caller's user id), `decidedAt` (now), `decisionNotes` (from
    `dto.decisionNotes ?? null`).
  - REFILL specifically: does NOT change `status` (stays `PENDING_FOLLOWUP` — this is the
    existing, correct business rule per the SRS; only LAPSE/COMPLETE change status). REFILL's
    update call therefore only touches the three new fields, not `status`. Use a plain
    `update` (not the conditional `updateMany` used for status transitions) for REFILL, since
    there's no status-guard race to protect against — but do re-check `existing.status ===
    'PENDING_FOLLOWUP'` before writing (same 409 guard as today, just without changing status
    on success).
  - LAPSE/COMPLETE: extend the existing `repository.updateStatus(id, fromStatus, toStatus)` call
    (or add a sibling repository method) so the same `update` also sets the three new fields
    atomically with the status change.
- Modify: `apps/risk-referral-service/src/referrals/referral.repository.ts` — extend `findMany`
  (currently `apps/risk-referral-service/src/referrals/referral.repository.ts:8-10`, no filter)
  to accept an optional `beneficiaryId` and apply it as a `where` clause when present; keep the
  existing unfiltered most-recent-50 behavior when absent.
- Modify: `apps/risk-referral-service/src/referrals/referral.controller.ts` — `GET /referrals`
  (currently ~lines 118-134, roles already `SAKHI, SUPERVISOR, MANAGER`) — add an optional
  `beneficiaryId` query param to its existing query schema, pass through to the repository call.
  Do not create a new route; extend the existing one.
- Modify: `apps/risk-referral-service/src/referrals/dto/decide-referral.dto.ts` — add
  `decisionNotes: z.string().trim().min(1).max(1000).optional()` to the existing
  `{ decision: z.enum(['LAPSE', 'REFILL', 'COMPLETE']) }.strict()` schema.
- Extend: `apps/risk-referral-service/src/referrals/referral.service.spec.ts` and
  `apps/risk-referral-service/src/referrals/referral.repository.ts`'s spec (find or create) and
  `apps/risk-referral-service/src/referrals/dto/decide-referral.dto.spec.ts`.

**Tests required:**
- `decide-referral.dto.spec.ts`: `decisionNotes` optional, valid when present, `.strict()` still
  rejects unknown fields.
- `referral.service.spec.ts`: REFILL now sets `decidedByUserId`/`decidedAt`/`decisionNotes`,
  status stays `PENDING_FOLLOWUP`; REFILL with no `decisionNotes` persists `null`, no error;
  LAPSE and COMPLETE also now populate the three new fields (regression check — status-change
  behavior itself must be unchanged); deciding on a non-PENDING_FOLLOWUP referral still 409;
  deciding on a nonexistent referral still 404; existing SUPERVISOR-roster IDOR check still
  enforced (403 outside roster) — this must not regress.
- Repository test: `findMany` with `beneficiaryId` returns only that beneficiary's referrals;
  `findMany` with no filter still returns existing most-recent-50 behavior.
- Route/integration: `GET /referrals?beneficiaryId=X` as SAKHI → 200, filtered; `GET /referrals`
  (no filter) as SAKHI → 200, unfiltered (unchanged); `PATCH /referrals/:id/decision` with
  `{ decision: 'REFILL', decisionNotes: '...' }` → 200, response includes the new fields and
  unchanged `status`.

## Task 3 — audit-service: SAKHI-safe audit write + idempotency

**Files:**
- New migration: `apps/audit-service/prisma/migrations/<timestamp>_add_audit_log_local_uuid/`
- Modify: `apps/audit-service/prisma/schema.prisma` — add to `model AuditLog`:
  ```prisma
  localAuditUuid String? @unique @map("local_audit_uuid") @db.VarChar(80)
  ```
- Modify: `apps/audit-service/src/audit/dto/create-auditLog.dto.ts` — add
  `localAuditUuid: z.string().trim().min(1).max(80).optional()` to the existing schema.
- Modify: `apps/audit-service/src/audit/auditLog.routes.ts` — widen `POST /audit`
  (currently `requireRoles('ADMIN', 'SUPERVISOR')` at ~line 103) to also permit `SAKHI`.
- Modify: `apps/audit-service/src/audit/auditLog.service.ts` (the file the route's own comment
  says already constrains non-ADMIN callers to their own `actorUserId` plus a namespaced
  `action` prefix for the existing SUPERVISOR case — find and read this constraint logic before
  changing it) — extend the SAME constraint mechanism to also cover `SAKHI` callers, allowlisting
  action-name prefixes `LMP_CHANGE_` and `FORM_ANSWER_EDIT_` for SAKHI specifically (Supervisor's
  existing `QUICK_RESPONSE_*` allowance is unrelated and must not change). A SAKHI caller
  attempting any other `action` prefix, or setting `actorUserId` to someone other than themselves,
  gets 403.
- Idempotency: on create, pre-check `localAuditUuid` when present; if found, return the existing
  row (200) instead of inserting a duplicate; catch P2002 race the same way as Tasks 1/2.
- Extend: `apps/audit-service/src/audit/dto/create-auditLog.dto.spec.ts` and
  `apps/audit-service/src/audit/auditLog.service.spec.ts` (or create if it doesn't exist yet).

**Tests required:**
- DTO: `localAuditUuid` optional, valid when present.
- Service: duplicate `localAuditUuid` on a second call returns the existing row, does not insert
  a second one; SAKHI caller writing an allowlisted action (`LMP_CHANGE_APPROVED`,
  `LMP_CHANGE_REJECTED`, `FORM_ANSWER_EDIT`) with their own `actorUserId` succeeds; SAKHI caller
  writing a non-allowlisted action (e.g. `ADMIN_OVERRIDE`) → 403; SAKHI caller setting
  `actorUserId` to a different user's id → 403; existing ADMIN/SUPERVISOR unrestricted behavior
  is unchanged (regression check — do not tighten those paths).

## Task 4 — approval-service: audit.client.ts + wire decideLmpChangeCard (both APPROVE and REJECT)

**Files:**
- New: `apps/approval-service/src/quick-response/audit.client.ts` — copy the exact shape of
  `apps/closure-reopen-service/src/reopen-requests/audit.client.ts` (same `log(actorUserId,
  action, entityType, entityId, afterJson, authorizationHeader)` signature, same fetch-to-gateway
  pattern, same `badGateway` throw on failure — the caller, not this client, catches it).
- Modify: `apps/approval-service/src/quick-response/quick-response.service.ts` — in
  `decideLmpChangeCard` (currently ~lines 1016-1076):
  - Import and construct the new `AuditClient`.
  - On the APPROVE branch, AFTER the existing successful `beneficiaryClient.applyLmpChange(...)`
    call, best-effort call `auditClient.log(decidedByUserId, 'LMP_CHANGE_APPROVED',
    'MotherCaseDetails', beneficiaryId, { lmpDate: newLmpDate }, authorizationHeader)` wrapped
    in its own try/catch that only logs failure and continues (mirror exactly how the existing
    notification call in this same method is already wrapped — same resilience style, do not
    let an audit failure roll back or fail the approval).
  - On the REJECT branch (which today does no side effects beyond notification — check the
    current REJECT branch's exact shape before editing), ALSO best-effort call
    `auditClient.log(decidedByUserId, 'LMP_CHANGE_REJECTED', 'MotherCaseDetails', beneficiaryId,
    { decision: 'REJECTED', reason: decisionNotes ?? null }, authorizationHeader)` — same
    try/catch resilience style. Both APPROVE and REJECT audit-log; only APPROVE mutates the
    beneficiary record.
- Extend: `apps/approval-service/src/quick-response/quick-response.service.spec.ts` (find the
  existing `decideLmpChangeCard` tests).

**Tests required:**
- On APPROVE, after successful `applyLmpChange`, `auditClient.log` is called once with
  `action: 'LMP_CHANGE_APPROVED'`, correct `entityType`/`entityId`/`afterJson`.
- On REJECT, `auditClient.log` is called once with `action: 'LMP_CHANGE_REJECTED'` and an
  `afterJson` that does NOT claim an LMP value changed.
- If `auditClient.log` throws/rejects on either branch, the LMP change (APPROVE) or the decision
  itself (REJECT) and the notification still succeed — best-effort, decision is not rolled back.

## Task 5 — visit-form-service: PATCH /form-submissions/:id/answers with SRS-scoped allowlist + audit

**Files:**
- New: `apps/visit-form-service/src/forms/form-answer-edit-allowlist.ts` — a hardcoded map,
  one entry per form code, of the exact field codes that SRS Appendix J.4
  (`docs/Arogya_Sakhi_SRS_v3.0.md:1849-1858`) marks editable without approval. Read that table
  section verbatim before writing this file — use the SRS's own field names/wording, mapped to
  this codebase's actual `fieldCode` values (cross-reference against the relevant form's seed
  JSON under `apps/visit-form-service/prisma/seed-data/*.json` to get exact `fieldCode` strings —
  do not guess field codes from the SRS's plain-English labels). Forms not listed in the SRS
  table (`ANC_VISIT`, any referral-linked form) get an empty array — always rejected.
- New: `apps/visit-form-service/src/forms/dto/patch-formSubmissionAnswers.dto.ts`:
  ```ts
  export const patchFormSubmissionAnswersSchema = z.object({
    edits: z.array(z.object({
      fieldCode: z.string().trim().min(1),
      value: jsonValueSchema, // reuse whatever generic JSON-value schema already exists in this
                              // service (check form.mapper.ts / existing DTOs for one before
                              // defining a new one)
    })).min(1).max(20),
  }).strict();
  ```
- New: `apps/visit-form-service/src/forms/audit.client.ts` — same shape as the other two audit
  clients created in this plan (Tasks 4); do not import across services, each service keeps its
  own copy per the existing per-service pattern.
- Modify: `apps/visit-form-service/src/forms/form.routes.ts` — add
  `PATCH /form-submissions/:id/answers` (roles `SAKHI`), validating `:id` as uuid and the body
  with the schema above.
- Modify: `apps/visit-form-service/src/forms/form.controller.ts` — add the handler, delegating
  to a new service method.
- Modify: `apps/visit-form-service/src/forms/form.service.ts` — add
  `updateSubmissionAnswers(submissionId, edits, actorUserId, authorizationHeader)`:
  - Load the submission (404 if not found/deleted), resolve its form code (via its
    `formVersion` relation).
  - For each edit, check `fieldCode` is in that form code's allowlist (from the new file above);
    if ANY edit's fieldCode is not allowlisted, reject the WHOLE request with 422 (do not
    partially apply) — name the offending fieldCode(s) in the error message.
  - If any `fieldCode` doesn't exist on the submission's form definition at all (not just
    "not allowlisted", but literally unknown), 400.
  - In one Prisma transaction: patch the named keys into `formDataJson` (merge, don't replace
    the whole blob), and update the matching `FormAnswer` row's typed value column (whichever of
    `answerValueText/Number/Date/Bool/Json` matches that field's `input_type`, following the
    exact same type-dispatch logic `buildFormAnswers` already uses in `form.mapper.ts` — reuse
    that logic/helper rather than re-implementing the type mapping).
  - After the transaction commits, best-effort call the new `audit.client.ts`'s `log(...)` with
    `action: 'FORM_ANSWER_EDIT'`, `entityType: 'FormSubmission'`, `entityId: submissionId`,
    and BOTH `beforeJson` (the prior values of just the edited fields) and `afterJson` (the new
    values) — this is the first caller in the codebase to populate `beforeJson`; do so.
  - Return the updated submission summary (echo the applied changes).
- Extend: `apps/visit-form-service/src/forms/form-answer-edit-allowlist.spec.ts` (new),
  `apps/visit-form-service/src/forms/dto/patch-formSubmissionAnswers.dto.spec.ts` (new),
  `apps/visit-form-service/src/forms/form.service.spec.ts` (extend).

**Tests required:**
- Allowlist unit test: one assertion per form/field pair in the SRS Appendix J.4 table; confirm
  `ANC_VISIT` and any referral-linked form code have an empty allowlist.
- Service: patching one allowlisted field updates both `formDataJson` and the matching
  `FormAnswer` row; patching multiple fields in one call applies all atomically; patching a
  non-allowlisted field for that form code → 422, and NONE of the edits in that request are
  applied (all-or-nothing); patching an unknown fieldCode (not on the form at all) → 400;
  submission not found → 404; audit client is called with correct `beforeJson`/`afterJson` per
  edited field; patching a field to its current value still succeeds and still audit-logs (no
  no-op exemption).
- Route/integration: `PATCH /form-submissions/:id/answers` as SAKHI with a valid allowlisted
  field → 200; as SUPERVISOR/unauthenticated → 403/401.

## Verification (after all 5 tasks)

- `npx nx run-many -t lint test build --projects=approval-service,risk-referral-service,audit-service,visit-form-service` clean.
- `npx tsc --noEmit` clean on all four touched services.
- Apply all 4 new migrations against the local dev database and confirm no migration errors.
- Live smoke test through the running gateway (do NOT reuse real user credentials — use a
  throwaway/test identity):
  1. `POST /api/v1/lmp-change-requests` → 201, then `GET /api/v1/lmp-change-requests?beneficiaryId=X` → shows it.
  2. Decide it (approve) → confirm `motherCaseDetails.lmpDate` updated AND an audit_log row with
     `action: 'LMP_CHANGE_APPROVED'` now exists (query `GET /api/v1/audit` as ADMIN to confirm).
  3. `PATCH /api/v1/referrals/:id/decision` with `{ decision: 'REFILL', decisionNotes: 'test' }`
     → confirm `decidedByUserId`/`decidedAt`/`decisionNotes` are populated and `status` unchanged.
  4. `PATCH /api/v1/form-submissions/:id/answers` on an allowlisted field → 200; on a
     non-allowlisted field → 422.
