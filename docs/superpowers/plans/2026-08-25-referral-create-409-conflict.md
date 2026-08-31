# Referral Creation — One-Referral-Per-Visit 409 Mapping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a second referral is created for a `visitId` that already has one, `POST /referrals` must return a clean `409 Conflict` (via `conflict()`) instead of leaking a raw Prisma unique-constraint error.

**Architecture:** `ReferralService.create()` currently calls `this.repository.create(dto)` directly with no error handling. Wrap that call in a try/catch, detect a Postgres unique-violation (Prisma error code `P2002`) on the `visit_referral_once` index specifically, and re-throw as `conflict()` from `@armman/service-commons`. Any other error re-throws unchanged. This mirrors the existing `isPrismaErrorCode`/`isUniqueConstraintViolation` pattern already used in `apps/visit-form-service/src/visit-schedules/visitSchedule.service.ts` and `apps/visit-form-service/src/forms/form.service.ts` — same shape, new file.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL), Jest.

**Spec:** `docs/Arogya_Sakhi_SRS_v3.0.md` (FR-S-6.1, Appendix E) for referral semantics; the one-referral-per-visit constraint itself is NOT stated in the SRS — it is defined only by the `visit_referral_once` unique index in `apps/risk-referral-service/prisma/schema.prisma:301` and its migration `apps/risk-referral-service/prisma/migrations/20260723120009_init/migration.sql:175` (`CREATE UNIQUE INDEX "visit_referral_once" ON "referrals"("visit_id");`). This plan treats that index as the authoritative source of the rule and closes the one gap versus it: the service layer doesn't yet translate the resulting DB error into a clean HTTP response.

## Verification already completed (do not re-verify)

Confirmed against the current codebase before writing this plan — re-stated here so the plan is self-contained for a fresh engineer:

- Referral creation already works end-to-end: `POST /referrals` (`apps/risk-referral-service/src/referrals/referral.controller.ts:329-348`) → `ReferralService.create()` (`apps/risk-referral-service/src/referrals/referral.service.ts:29-31`) → `ReferralRepository.create()`.
- A distinct `REFERRAL_VISIT` form already exists in visit-form-service (`apps/visit-form-service/prisma/seed.ts` seeds it with `entityType: 'REFERRAL'`, backed by `apps/visit-form-service/prisma/seed-data/referral-visit.json`) — no new form work needed.
- The one-referral-per-visit constraint already exists at the DB layer: `@@unique([visitId], map: "visit_referral_once")` on the `Referral` Prisma model (`apps/risk-referral-service/prisma/schema.prisma:301`), implemented as a plain Postgres `CREATE UNIQUE INDEX` on a nullable column — which Postgres treats as "unique among non-null values, any number of NULLs allowed," exactly matching the intended "one referral per visit, but referrals with no visitId are unrestricted" behavior. **No schema/migration change needed.**
- The ONLY gap: `ReferralService.create()` has zero error handling. A second `POST /referrals` for the same `visitId` currently throws a raw `PrismaClientKnownRequestError` (code `P2002`), which the global error handler will map to a generic `500`, not the `409` the rest of this service uses for conflicts (e.g. `decide()` already uses `conflict()` — see `referral.service.ts`'s other methods for the existing convention).

## Global Constraints

- Files ≤ ~250 lines — split by responsibility when larger (root `.claude/CLAUDE.md` §3). `referral.service.ts` must be checked for its current line count before adding to it.
- No `any` — use `unknown` + narrowing (root `.claude/CLAUDE.md` §3).
- Throw `HttpError` helpers (`conflict()`, etc.) from `@armman/service-commons` for expected failures; never leak raw DB errors (root `.claude/CLAUDE.md` §5).
- Public functions get a short JSDoc explaining _what_ and _why_ (root `.claude/CLAUDE.md` §3).
- `snake_case` for database identifiers, `camelCase` for TS (root `.claude/CLAUDE.md` §4).
- Jest + ts-jest, tests live beside code as `*.spec.ts` (root `.claude/CLAUDE.md` §12).
- No cross-service joins — this change touches only `risk-referral-service`'s own files (service `.claude/CLAUDE.md`).

---

## Task 1: Map the `visit_referral_once` unique-constraint violation to a 409

**Files:**

- Modify: `apps/risk-referral-service/src/referrals/referral.service.ts` (currently 30 lines longer than the snippet shown below — read the full file first; do not assume line numbers without checking)
- Test: `apps/risk-referral-service/src/referrals/referral.service.spec.ts` (create if it does not exist; check first)

**Interfaces:**

- Consumes: `ReferralRepository.create(dto: CreateReferralInput)` (existing, unchanged signature — returns `Promise<Referral>` per Prisma's generated type) — `apps/risk-referral-service/src/referrals/referral.repository.ts`.
- Consumes: `conflict` from `@armman/service-commons` (already imported in `referral.service.ts` — confirmed via `grep -n "conflict" apps/risk-referral-service/src/referrals/referral.service.ts`, used by other methods like `decide()`).
- Produces: `ReferralService.create(dto: CreateReferralInput): Promise<Referral>` — same public signature as today, only its _rejection_ behavior changes (throws `HttpError` with `status: 409` instead of a raw Prisma error, for exactly the `visitId`-collision case).

- [ ] **Step 1: Read the current file in full to get exact line numbers and confirm nothing else changed underneath**

Run: `sed -n '1,40p' apps/risk-referral-service/src/referrals/referral.service.ts`

Confirm the `create()` method still reads exactly:

```ts
create(dto: CreateReferralInput) {
  return this.repository.create(dto);
}
```

If it has changed since this plan was written, stop and re-read the whole file before proceeding — do not blindly apply the diff below.

- [ ] **Step 2: Check whether `referral.service.spec.ts` already exists**

Run: `find apps/risk-referral-service/src/referrals -iname "referral.service.spec.ts"`

If it exists, read it in full to learn its existing mock setup (how `repository` is mocked, what `dto` fixtures already exist) before writing the new test — reuse that fixture style rather than inventing a new one.

- [ ] **Step 3: Write the failing test**

Add this test to `referral.service.spec.ts` (create the file with a minimal `ReferralService` instantiation + mocked repository if it doesn't exist yet — mirror the mock-repository pattern used in `apps/visit-form-service/src/visit-schedules/visitSchedule.service.spec.ts`, i.e. a plain object of `jest.fn()`s cast `as unknown as jest.Mocked<ReferralRepository>`):

```ts
it('rejects with 409 when a second referral is created for a visitId that already has one', async () => {
  const dto = {
    beneficiaryId: '11111111-1111-1111-1111-111111111111',
    visitId: '22222222-2222-2222-2222-222222222222',
    referralTypeLookupValueId: '33333333-3333-3333-3333-333333333333',
    referralDate: new Date('2026-08-25'),
    status: 'INITIATED',
  } as CreateReferralInput;

  repository.create.mockRejectedValue({
    code: 'P2002',
    meta: { target: ['visit_referral_once'] },
  });

  await expect(service.create(dto)).rejects.toMatchObject({ status: 409 });
});

it('rethrows a non-unique-constraint error unchanged', async () => {
  const dto = {
    beneficiaryId: '11111111-1111-1111-1111-111111111111',
    referralTypeLookupValueId: '33333333-3333-3333-3333-333333333333',
    referralDate: new Date('2026-08-25'),
    status: 'INITIATED',
  } as CreateReferralInput;
  const dbError = new Error('connection reset');

  repository.create.mockRejectedValue(dbError);

  await expect(service.create(dto)).rejects.toBe(dbError);
});

it('creates successfully when no visitId collision occurs', async () => {
  const dto = {
    beneficiaryId: '11111111-1111-1111-1111-111111111111',
    referralTypeLookupValueId: '33333333-3333-3333-3333-333333333333',
    referralDate: new Date('2026-08-25'),
    status: 'INITIATED',
  } as CreateReferralInput;
  const created = { id: 'ref-1', ...dto };
  repository.create.mockResolvedValue(created as never);

  await expect(service.create(dto)).resolves.toEqual(created);
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx nx test risk-referral-service --testPathPattern="referral.service.spec"`
Expected: the 409 test FAILs — `service.create(dto)` currently rejects with the raw `{ code: 'P2002', ... }` object, not an `HttpError` with `status: 409` (Jest's `toMatchObject({ status: 409 })` on a plain `{code, meta}` object fails since it has no `status` field). The other two tests may already pass by coincidence (no error handling means they pass through unchanged) — that's fine, they're regression guards for Step 6.

- [ ] **Step 5: Implement the minimal fix**

In `apps/risk-referral-service/src/referrals/referral.service.ts`, replace:

```ts
create(dto: CreateReferralInput) {
  return this.repository.create(dto);
}
```

with:

```ts
/**
 * Creates a referral. `visitId` is protected by the `visit_referral_once`
 * unique index (schema.prisma) — at most one referral per visit, referrals
 * with no visitId are unrestricted. A collision surfaces here as a clean
 * 409, not the raw Prisma unique-constraint error the DB throws.
 */
async create(dto: CreateReferralInput) {
  try {
    return await this.repository.create(dto);
  } catch (err) {
    if (isUniqueConstraintViolation(err, 'visit_referral_once')) {
      throw conflict('A referral already exists for this visit.');
    }
    throw err;
  }
}
```

Then add this helper near the bottom of the same file (below the `ReferralService` class, matching where `visitSchedule.service.ts` places its own `isUniqueConstraintViolation`):

```ts
/**
 * Narrows a caught Prisma error to a unique-constraint violation (P2002) on
 * a specific named index — same pattern as visitSchedule.service.ts's own
 * isUniqueConstraintViolation, generalized to check the constraint name so
 * a future unrelated unique index on this table doesn't get misreported as
 * a visit collision.
 */
function isUniqueConstraintViolation(err: unknown, constraintName: string): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  if ((err as { code: unknown }).code !== 'P2002') return false;
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('target' in meta)) return false;
  const target = (meta as { target?: unknown }).target;
  return Array.isArray(target) ? target.includes(constraintName) : target === constraintName;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npx nx test risk-referral-service --testPathPattern="referral.service.spec"`
Expected: all three tests PASS.

- [ ] **Step 7: Run the full risk-referral-service suite to confirm nothing else broke**

Run: `npx nx test risk-referral-service`
Expected: all existing tests still pass — `create()`'s signature (`create(dto: CreateReferralInput): Promise<Referral>`) is unchanged, only its rejection path is now typed differently, so no other call site should need updating. Grep to confirm no other file calls `service.create(...).catch(...)` expecting the old raw-error shape:

Run: `grep -rn "\.create(" apps/risk-referral-service/src --include="*.ts" | grep -v spec | grep -v repository.create`

- [ ] **Step 8: Type-check**

Run: `npx tsc --noEmit -p apps/risk-referral-service/tsconfig.json`
Expected: no errors.

- [ ] **Step 9: Lint**

Run: `npx nx lint risk-referral-service --skip-nx-cache`
Expected: `✔ All files pass linting`. If `referral.service.ts` now exceeds ~250 lines, split `isUniqueConstraintViolation` (and any other free-standing helper functions in the file) into a small `referral.prisma-errors.ts` sibling file instead of leaving the file oversized — check the line count first (`wc -l apps/risk-referral-service/src/referrals/referral.service.ts`) before deciding whether a split is warranted.

- [ ] **Step 10: Update the route's documented error responses**

`apps/risk-referral-service/src/referrals/referral.controller.ts`'s `POST /referrals` OpenAPI `responses` block (around line 334-339) currently lists only `201/400/401/403` — add `409` so the documented contract matches the new real behavior:

```ts
responses: {
  201: { description: 'Referral created', schema: envelope(referralSchema) },
  400: { description: 'Validation error', schema: apiErrorSchema },
  401: { description: 'Unauthenticated', schema: apiErrorSchema },
  403: { description: 'Caller role not permitted', schema: apiErrorSchema },
  409: {
    description: 'A referral already exists for this visit',
    schema: apiErrorSchema,
  },
},
```

- [ ] **Step 11: Re-run lint and the full test suite once more after the doc change**

Run: `npx nx lint risk-referral-service --skip-nx-cache && npx nx test risk-referral-service`
Expected: both clean/passing — the route change is documentation-only (no new middleware/logic), so this is a final confirmation, not expected to surface anything new.

- [ ] **Step 12: Commit**

```bash
git add apps/risk-referral-service/src/referrals/referral.service.ts apps/risk-referral-service/src/referrals/referral.service.spec.ts apps/risk-referral-service/src/referrals/referral.controller.ts
git commit -m "fix(risk-referral-service): Map one-referral-per-visit collision to 409

POST /referrals previously let the visit_referral_once unique-constraint
violation leak as a raw Prisma error (surfacing as an unhandled 500)
instead of the clean 409 the rest of this service uses for conflicts."
```

---

## Self-Review

**Spec coverage:** The task title asked for three things — "referral creation, referral form, and one-referral-per-visit rule." Verification (done before this plan was written, see the "Verification already completed" section) found referral creation and the referral form already fully implemented and working; the one-referral-per-visit rule already enforced at the DB layer. The only gap versus that rule being usable end-to-end is the missing error-response mapping, which Task 1 closes. Per the user's explicit scope decision, no other gap-closing work is included in this plan.

**Placeholder scan:** No TBD/TODO/"add appropriate handling" phrases — every step has literal code or an exact command.

**Type consistency:** `isUniqueConstraintViolation(err: unknown, constraintName: string): boolean` is defined once (Step 5) and used once (in `create()`, same step) — no drift. `CreateReferralInput` is the existing DTO type already imported in `referral.service.ts` (confirmed via the file's existing import list) — no new type introduced.
