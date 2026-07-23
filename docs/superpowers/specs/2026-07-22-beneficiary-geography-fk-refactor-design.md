# beneficiary_pii geography-column consolidation — design

## Problem

`beneficiary_pii` stores 7 separate geography columns (`villageId`, `padaId`,
`healthSubCentreId`, `phcId`, `healthBlockId`, `stateId`, `districtId`, `talukaId`),
which read like the ERD's unimplemented per-level "Model B" tables (`village`,
`pada`, `health_sub_centre`, ...). Per the earlier design/plan cycle for the geography
children/roots endpoints (`docs/superpowers/specs/2026-07-22-geography-children-endpoint-design.md`),
we already confirmed **`geography_units` (Model A) is the single source of truth** —
these 7 columns are, in the running code, all foreign keys into `geography_units`,
distinguished by which `geoType` each column expects. This refactor makes that
explicit in the schema: replace the 7 columns with one `geographyUnitId` pointer into
`geography_units`, matching the model everywhere else in the system
(`project_geographies`, `sakhi_assignments`) already uses.

## Prior research (this session)

An exhaustive repo-wide search found these columns used consistently across exactly
these files, all within `beneficiary-service` (plus incidental, non-code mentions in
`auth-service` comments and the Postman collection):

- **Schema/migration:** `apps/beneficiary-service/prisma/schema.prisma` (model
  `BeneficiaryPii`), `apps/beneficiary-service/prisma/migrations/20260716052346_init/migration.sql`
  (the only migration that created these columns — **no seed data and no existing rows
  to migrate**, confirmed no `seed*.ts` exists under this service).
- **DTO validation:** `create-beneficiary.dto.ts` (`piiSchema`), `list-beneficiaries.dto.ts`
  (`villageId`/`padaId` list filters).
- **Response projection:** `beneficiary.mapper.ts` (`withDecryptedName`),
  `beneficiary.controller.ts` (`piiResponseSchema`), `beneficiary.repository.types.ts`
  (`PiiRow`, `PiiCreateData`, `BeneficiaryListFilters`).
- **Write path:** `beneficiary.service.ts` (assembles `PiiCreateData`, including the
  existing `phcId`→`healthBlockId` server-side derivation via
  `geography.client.ts`'s `resolveHealthBlockIdFromPhc`), `beneficiary.repository.ts`
  (`createEnrollment`'s Prisma write, `findMany`'s list-filter query).
- **Duplicate detection:** `beneficiary.duplicate-detection.ts` (`buildSearchTokens`
  hashes only `villageId`+`padaId` into `geographyToken`).
- **Tests:** `beneficiary.service.spec.ts`, `create-beneficiary.dto.spec.ts` (fixtures +
  required-field assertions + the existing `healthBlockId`-optional test cases).

No hits in `reporting-etl-service` (stub only), `sync-service`, `risk-referral-service`,
or any other service. `BeneficiaryCurrentSummary.stateId`/`districtId` is a **different**
table with its own, differently-named geography pointers (`blockGeographyUnitId`,
`panchayatId`, `villageGeographyUnitId`) — explicitly out of scope, not touched here.

## Scope of this change

### 1. Schema (additive migration, no drops)

Add two nullable columns to `beneficiary_pii`:

```prisma
geographyUnitId      String? @map("geography_unit_id")
// JSON array of ancestor geography_units.geographyUnitId values, ordered from
// geographyUnitId itself up to STATE (mirrors auth-service's
// GET /geography-units/:id/ancestors response shape). Denormalized so
// list-filtering and duplicate-detection never need a live cross-service call.
geographyAncestorIds Json?   @map("geography_ancestor_ids")
```

The existing 7 columns and their "owned by another service" doc-comments are
**unchanged**. Dropping them is explicitly deferred to a **future, separate** migration
once the mobile app's rollout to the new shape is confirmed complete — not part of this
change.

### 2. DTO — accept both shapes, mutually exclusive

`piiSchema` gains an optional `geographyUnitId: z.string().uuid()`. The 7 legacy
fields become individually `.optional()` at the schema level, but a `superRefine`
enforces:

- Exactly one of {`geographyUnitId`} or {the legacy fields} must be present — never
  both, never neither.
- When the legacy shape is used, `villageId`, `healthSubCentreId`, `phcId`, `stateId`,
  `districtId` remain **required** (matching today's behavior exactly); `padaId`,
  `talukaId`, `healthBlockId` stay optional (also matching today).

This preserves every existing DTO test case unmodified while adding the new path.

### 3. Server-side resolution (`beneficiary.service.ts` + `geography.client.ts`)

Before writing, resolve one of two ways:

- **New shape (`geographyUnitId` sent):** call auth-service's existing
  `GET /geography-units/:id/ancestors` (add a `getAncestorChain` method to
  beneficiary-service's `geography.client.ts`, mirroring the one that already exists in
  `visit-form-service`'s client of the same name). Derive the 7 legacy columns from the
  chain by `geoType` (`VILLAGE`→`villageId`, `PADA`→`padaId`, `SUBCENTRE`→`healthSubCentreId`,
  `PHC`→`phcId`, `BLOCK`→`healthBlockId`, `DISTRICT`→`districtId`, `STATE`→`stateId`).
  `talukaId` has no `geoType` counterpart and stays `null` for new-shape requests (per
  the earlier ERD-conflict resolution — Taluka isn't part of `geography_units`).
  Store `geographyUnitId` = the input id; `geographyAncestorIds` = the full chain's ids.
- **Legacy shape (7 fields sent):** pick the most specific non-null field, in order
  `padaId > villageId > healthSubCentreId > phcId > healthBlockId > districtId > stateId`,
  as the leaf. Call the same ancestor-chain API on that leaf to validate it (ACTIVE,
  exists) and fetch its ancestors. Store `geographyUnitId` = the leaf id;
  `geographyAncestorIds` = the resolved chain. The 7 legacy fields are stored exactly as
  sent — no server override of client-provided legacy values.

The existing `phcId`→`healthBlockId` auto-derivation (mobile never sends
`healthBlockId`) is preserved unchanged for legacy-shape requests; new-shape requests
get the equivalent value from the ancestor chain instead.

### 4. Read paths — filtering, dedup, response

- **List filtering** (`GET /beneficiaries?villageId=&padaId=`): query param shape is
  **unchanged** (non-breaking for existing dashboard/API consumers). Internally,
  `beneficiary.repository.ts`'s `findMany()` switches from filtering on the raw
  `villageId`/`padaId` columns to a JSON-containment query against
  `geographyAncestorIds` — works uniformly for rows created via either request shape,
  since both always populate the ancestor cache.
- **Duplicate detection**: `buildSearchTokens` reads the two most-specific ids from the
  resolved ancestor chain (computed once during Section 3, passed in) instead of
  reading `dto.pii.villageId`/`dto.pii.padaId` directly — same `geographyToken` hash
  shape and matching behavior, sourced correctly regardless of request shape.
- **API response**: `beneficiary.mapper.ts` / `piiResponseSchema` additively include
  `geographyUnitId` and `geographyAncestorIds`; all 7 legacy fields are still returned
  unchanged.

## Explicitly out of scope

- Dropping the 7 legacy columns — a later, separate migration, once the mobile app's
  transition to the new shape is confirmed.
- `BeneficiaryCurrentSummary`'s own geography columns (`blockGeographyUnitId`,
  `panchayatId`, `villageGeographyUnitId`, `stateId`, `districtId`) — a different table,
  different concept, not touched.
- Any change to `geography_units` itself, or to the geography children/roots endpoints
  shipped in the prior PR (#60) — this change only consumes the existing
  `GET /geography-units/:id/ancestors` endpoint, adds no new auth-service routes.
- Any mobile app code change — out of this backend repo's scope; this design only
  ensures the backend can accept either shape so the app team can migrate on their own
  timeline.
- Deprecation/removal timeline and communication to the mobile team — a product/process
  decision, not part of this technical design.

## Testing

Automated Jest tests, following this repo's mandatory test-case-approval workflow.
Planned coverage (finalized during the implementation-plan step):

- DTO: new-shape-only accepted; legacy-shape-only accepted; both together rejected;
  neither present rejected; legacy shape still enforces the same required subset as
  today; `healthBlockId`/`talukaId`/`padaId` remain optional in both non-error cases.
- Service/resolution: new-shape request derives all 7 legacy fields correctly from a
  mocked ancestor chain; legacy-shape request resolves and validates via the leaf-most
  field per the precedence order; `healthBlockId` derivation preserved for legacy shape;
  invalid/inactive/non-existent geography id surfaces the existing error path (via
  `geography.client.ts`, unchanged error semantics).
- Read paths: list filter by `villageId` matches rows created via either shape;
  duplicate-detection token matches across both shapes for the same underlying
  location; API response includes both old and new fields.

## Branch

`feature/beneficiary-geography-fk-refactor`, off `origin/develop` (the real integration
branch — `main` is confirmed to be an empty initial commit with no code, not a valid
base for any work in this repo).
