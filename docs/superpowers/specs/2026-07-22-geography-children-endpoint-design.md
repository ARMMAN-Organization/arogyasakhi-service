# Geography children/roots listing endpoints — design

## Problem

The SRS requires cascading geography filters/dropdowns (State → District → Block → ...,
SRS line 971), and the HLD's admin `GeographyTree` component implies browsing the
hierarchy top-down. Today, `auth-service`'s geography API only supports **bottom-up**
resolution:

- `GET /geography-units/:id` — get one unit
- `GET /geography-units/:id/ancestors` — walk up to STATE

There is no way to walk **down** the tree (list a unit's children, or list the top-level
STATEs) — so a client has no API path to discover "what districts exist under this
state" or "what states exist at all."

## Resolving the ERD's two geography models

The ERD (`docs/Arogya_Sakhi_Database_Design_ERD_Table_Definitions.docx.md`) defines two
geography data models that were never reconciled in the source document itself:

- **Model A** — a single self-referencing `geography_units` table (`geographyUnitId`,
  `parentId`, `geoType` enum STATE..PADA). This is the **only** model actually
  implemented: real Prisma model, migration, and a working read API in `auth-service`
  (`apps/auth-service/prisma/schema.prisma`, `apps/auth-service/src/geography/`).
- **Model B** — separate normalized tables per level (`state`, `districts`, `talukas`,
  `health_blocks`, `phcs`, `health_sub_centres`, `villages`, `padas`, plus two
  many-to-many mapping tables). Referenced only in ERD prose (lines 617–765); **zero**
  tables, migrations, or code exist for it anywhere in the repo.

`beneficiary_pii` (per the ERD) carries columns named `villageId`, `padaId`,
`healthSubCentreId`, `phcId`, `healthBlockId`, `stateId`, `districtId`, `talukaId` —
which look like Model B foreign keys. In the actual running code, these columns hold
**Model A `geography_units.geographyUnitId` UUIDs**, validated by `geoType`
(`beneficiary-service`'s `resolveHealthBlockIdFromPhc` calls
`GET /geography-units/:id` — i.e. it resolves against `geography_units`, not against
any `phcs`/`health_blocks` table, because those tables don't exist).

**Decision: `geography_units` (Model A) is the single source of truth for all
geography data**, including beneficiary and Sakhi location. `beneficiary_pii`'s 7
differently-named columns are FKs into `geography_units`, distinguished by expected
`geoType` at each column — not a second, independent schema. This matches
`apps/auth-service/.claude/CLAUDE.md`'s existing documented scope decision ("the SRS's
7-level hierarchy only ... no Taluka or Panchayat").

**Out of scope for this change:** refactoring `beneficiary_pii`'s column names/shape to
a single `geographyUnitId`, or building Model B's tables. Both are separate, larger
efforts if ever pursued — not part of this design.

## Scope of this change

Two new **read-only** endpoints in `auth-service`, alongside the existing two, using
the exact same conventions (auth, envelope, error responses, `geographyUnitSchema`):

### 1. `GET /geography-units/:id/children`

Lists the direct children of a unit (e.g. all districts under a state).

- 404 if `:id` doesn't exist or is soft-deleted (matches `getById`/`getAncestors`).
- Returns `200` with `[]` if the unit exists but has no children (e.g. a PADA leaf) —
  valid, not an error.
- Excludes soft-deleted children.
- Ordered by `geoCode` ascending (no explicit sort-order column exists today).

### 2. `GET /geography-units/roots`

Lists all top-level units (`parentId IS NULL`, i.e. all STATEs) — the cascade's entry
point, since there's currently no way to discover states via API.

- Always `200`; an empty array is valid (no states seeded).
- Excludes soft-deleted roots.

## Explicitly out of scope

- Model B (normalized per-level tables) — not built.
- Any write/CRUD API for geography units — controller stays documented read-only
  ("no service owns writes to geography master data yet outside seeding").
- RBAC/permission changes — same "open to any authenticated role" policy as today.
- `beneficiary_pii` schema changes.
- Adding children/roots methods to the cross-service `geography.client.ts` files in
  `beneficiary-service`/`visit-form-service` — neither currently needs them; no
  speculative client methods.

## Files touched (auth-service only)

- `apps/auth-service/src/geography/geography.repository.ts` — add `findChildren(parentId)`
  and `findRoots()`.
- `apps/auth-service/src/geography/geography.service.ts` — add `getChildren(id)` (throws
  `notFound` if the parent itself doesn't exist/is soft-deleted) and `getRoots()` (no
  not-found case).
- `apps/auth-service/src/geography/geography.controller.ts` — register the two new
  routes, reusing existing `geographyUnitSchema` / `envelope` / `errorResponse` helpers.
- New/updated spec files for the above (unit + route-level tests).

## Testing

Automated Jest tests only (per this repo's mandatory Step 3 workflow — test cases
proposed and approved before implementation). Planned coverage:

- `children`: parent with multiple children; parent with zero children (empty array,
  not 404); non-existent parent id (404); soft-deleted children excluded from results;
  soft-deleted parent treated as not-found.
- `roots`: multiple STATEs present; no STATEs seeded (empty array); soft-deleted roots
  excluded.

## Branch

New branch `feature/geography-children-endpoint`, off the current branch
`feature/swagger-error-docs-and-modularization` (clean working tree, confirmed via
`git status` before branching).
