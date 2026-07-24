# Geography children/roots endpoints Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two read-only endpoints to auth-service's geography API —
`GET /geography-units/:id/children` and `GET /geography-units/roots` — so clients can
walk the `geography_units` hierarchy top-down (list a unit's children; list all
top-level STATEs), matching the existing bottom-up endpoints (`:id`, `:id/ancestors`).

**Architecture:** Follow the exact repository → service → controller pattern already
used by `getById`/`getAncestors` in `apps/auth-service/src/geography/`. No new files,
no schema changes, no new tables/migrations — `geography_units` already exists. Add two
methods to the existing repository, two to the existing service, two routes to the
existing controller.

**Tech Stack:** TypeScript, Express, Prisma (`GeographyUnit` model), Zod validation,
Jest for tests. Same libs already used by the file.

## Global Constraints

- No `any` — use `unknown` + narrowing (root CLAUDE.md §3).
- Public functions get a short JSDoc explaining what and why (root CLAUDE.md §3).
- Files ≤ ~250 lines — split by responsibility when larger (root CLAUDE.md §3). None of
  the 3 files approach this after these changes; no split needed.
- Soft-deleted rows (`isDeleted: true`) must never be returned or resolvable (root
  CLAUDE.md §11; existing `findById`/`findAncestors` precedent).
- `.strict()` Zod schemas at the route edge (root CLAUDE.md §8) — N/A here, both new
  routes take no body and no new params beyond the existing `:id` param schema.
- Standard response envelope `{ success, message, data }` / error envelope
  `{ success: false, message, errorCode, details }` (root CLAUDE.md §6).
- This repo requires plan + test-case approval before implementation — this plan is
  Step 2; the test code embedded in each task below is written but not yet run, and
  constitutes Step 3 (test cases) for your review before Step 4 (implementation) begins
  in earnest. Run tasks in order; stop after Task 1's tests are written if you want a
  second checkpoint before proceeding to Tasks 2–4.

---

### Task 1: Repository — `findChildren` and `findRoots`

**Files:**

- Modify: `apps/auth-service/src/geography/geography.repository.ts`
- Test: `apps/auth-service/src/geography/geography.repository.spec.ts` (new file — no
  repository-level test file exists yet anywhere in this repo for any service;
  service-level tests mock the repository instead, so this is the first test that
  exercises real Prisma query-building logic directly. Mock `this.prisma.geographyUnit.findMany` on a plain object cast to the Prisma client type, exactly as shown in Step 1
  below — no real database connection.)

**Interfaces:**

- Produces: `findChildren(parentId: string): Promise<GeographyUnit[]>` — direct
  children of `parentId`, excluding soft-deleted, ordered by `geoCode` ascending.
- Produces: `findRoots(): Promise<GeographyUnit[]>` — units with `parentId: null`,
  excluding soft-deleted, ordered by `geoCode` ascending.
- Consumes: `this.prisma.geographyUnit.findMany` (Prisma client already injected via
  constructor, same as existing `findById`/`findAncestors`).

- [ ] **Step 1: Write the failing tests**

Create `apps/auth-service/src/geography/geography.repository.spec.ts`:

```typescript
import { GeographyRepository } from './geography.repository';

describe('GeographyRepository', () => {
  const findMany = jest.fn();
  const prisma = { geographyUnit: { findMany } } as never;
  let repository: GeographyRepository;

  beforeEach(() => {
    jest.clearAllMocks();
    repository = new GeographyRepository(prisma);
  });

  describe('findChildren', () => {
    it('queries direct children of parentId, excluding soft-deleted, ordered by geoCode', async () => {
      findMany.mockResolvedValue([
        { geographyUnitId: 'district-1', parentId: 'state-1', geoType: 'DISTRICT' },
      ]);

      const result = await repository.findChildren('state-1');

      expect(findMany).toHaveBeenCalledWith({
        where: { parentId: 'state-1', isDeleted: false },
        orderBy: { geoCode: 'asc' },
      });
      expect(result).toEqual([
        { geographyUnitId: 'district-1', parentId: 'state-1', geoType: 'DISTRICT' },
      ]);
    });

    it('returns an empty array when the parent has no children', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findChildren('pada-1');
      expect(result).toEqual([]);
    });
  });

  describe('findRoots', () => {
    it('queries units with parentId null, excluding soft-deleted, ordered by geoCode', async () => {
      findMany.mockResolvedValue([
        { geographyUnitId: 'state-1', parentId: null, geoType: 'STATE' },
      ]);

      const result = await repository.findRoots();

      expect(findMany).toHaveBeenCalledWith({
        where: { parentId: null, isDeleted: false },
        orderBy: { geoCode: 'asc' },
      });
      expect(result).toEqual([{ geographyUnitId: 'state-1', parentId: null, geoType: 'STATE' }]);
    });

    it('returns an empty array when no roots are seeded', async () => {
      findMany.mockResolvedValue([]);
      const result = await repository.findRoots();
      expect(result).toEqual([]);
    });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config apps/auth-service/jest.config.ts src/geography/geography.repository.spec.ts`

Expected: FAIL — `TypeError: repository.findChildren is not a function` (and same for
`findRoots`), since neither method exists yet.

- [ ] **Step 3: Implement `findChildren` and `findRoots`**

Read the current file first — it looks like this:

```typescript
import type { GeographyUnit } from '../../../../node_modules/.prisma/client-auth-service';
import type { PrismaService } from '../prisma/prisma.service';

/** Data access for geography_units master data (State/District/Block/PHC/Sub-centre/Village/Pada). */
export class GeographyRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.geographyUnit.findFirst({
      where: { geographyUnitId: id, isDeleted: false },
    });
  }

  async findAncestors(id: string) {
    const chain: GeographyUnit[] = [];
    let currentId: string | null = id;

    while (currentId) {
      const unit: GeographyUnit | null = await this.prisma.geographyUnit.findFirst({
        where: { geographyUnitId: currentId, isDeleted: false },
      });
      if (!unit) break;
      chain.push(unit);
      currentId = unit.parentId;
    }

    return chain;
  }
}
```

Add these two methods inside the class, after `findAncestors`:

```typescript
  /** Direct children of `parentId` (one level down), excluding soft-deleted, ordered by geoCode. */
  findChildren(parentId: string) {
    return this.prisma.geographyUnit.findMany({
      where: { parentId, isDeleted: false },
      orderBy: { geoCode: 'asc' },
    });
  }

  /** Top-level units (no parent — i.e. all STATEs), excluding soft-deleted, ordered by geoCode. */
  findRoots() {
    return this.prisma.geographyUnit.findMany({
      where: { parentId: null, isDeleted: false },
      orderBy: { geoCode: 'asc' },
    });
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config apps/auth-service/jest.config.ts src/geography/geography.repository.spec.ts`

Expected: PASS — all 4 tests green.

- [ ] **Step 5: Commit**

```bash
git add apps/auth-service/src/geography/geography.repository.ts apps/auth-service/src/geography/geography.repository.spec.ts
git commit -m "feat(geography): add findChildren/findRoots to geography repository"
```

---

### Task 2: Service — `getChildren` and `getRoots`

**Files:**

- Modify: `apps/auth-service/src/geography/geography.service.ts`
- Modify: `apps/auth-service/src/geography/geography.service.spec.ts`

**Interfaces:**

- Consumes: `GeographyRepository.findChildren(parentId: string): Promise<GeographyUnit[]>`,
  `GeographyRepository.findRoots(): Promise<GeographyUnit[]>` (Task 1).
  Consumes: `notFound` from `@armman/service-commons` (already imported in this file).
  Consumes: existing private `toApiGeographyUnit(u: Record<string, unknown>)` (already
  defined in this file — reuse as-is, do not duplicate).
- Produces: `getChildren(id: string): Promise<ApiGeographyUnit[]>` — throws `notFound`
  if `id` itself doesn't exist (mirrors `getAncestors`'s not-found behavior: an
  unknown/soft-deleted **parent** is a 404, but a valid parent with zero children
  returns `[]`).
- Produces: `getRoots(): Promise<ApiGeographyUnit[]>` — never throws; `[]` is a valid
  result.
- `ApiGeographyUnit` here means the exact shape returned by `toApiGeographyUnit`:
  `{ geographyUnitId, parentId, geoType, geoCode, name, status }`.

**Important design note on `getChildren`'s not-found check:** `findChildren` alone
cannot distinguish "parent exists but has no children" from "parent doesn't exist" —
both return `[]` from Prisma. To 404 correctly on a missing/deleted parent, `getChildren`
must also check the parent exists, via the repository's existing `findById`.

- [ ] **Step 1: Write the failing tests**

Read the current file first — it looks like this:

```typescript
import { notFound } from '@armman/service-commons';
import type { GeographyRepository } from './geography.repository';

function toApiGeographyUnit(u: Record<string, unknown>) {
  return {
    geographyUnitId: u.geographyUnitId,
    parentId: u.parentId,
    geoType: u.geoType,
    geoCode: u.geoCode,
    name: u.name,
    status: u.status,
  };
}

export class GeographyService {
  constructor(private readonly repository: GeographyRepository) {}

  async getById(id: string) {
    const unit = await this.repository.findById(id);
    if (!unit) throw notFound('Geography unit not found.');
    return toApiGeographyUnit(unit as unknown as Record<string, unknown>);
  }

  async getAncestors(id: string) {
    const chain = await this.repository.findAncestors(id);
    if (!chain.length) throw notFound('Geography unit not found.');
    return chain.map((u) => toApiGeographyUnit(u as unknown as Record<string, unknown>));
  }
}
```

Add to `apps/auth-service/src/geography/geography.service.spec.ts`, inside the top-level
`describe('GeographyService', ...)` block, after the existing `findAncestors` mock in
the `repository` object at the top of the file — first update the mocked repository
object (near the top of the spec file) to also stub the two new methods:

```typescript
const repository = {
  findById: jest.fn(),
  findAncestors: jest.fn(),
  findChildren: jest.fn(),
  findRoots: jest.fn(),
} as unknown as jest.Mocked<GeographyRepository>;
```

Then add two new `describe` blocks at the end of the file, before the final closing
`});` of the outer `describe('GeographyService', ...)`:

```typescript
describe('getChildren', () => {
  it('returns the projected children of a parent that has some', async () => {
    repository.findById.mockResolvedValue({
      geographyUnitId: 'state-1',
      parentId: null,
      geoType: 'STATE',
      geoCode: 'MH',
      name: 'Maharashtra',
      status: 'ACTIVE',
    } as never);
    repository.findChildren.mockResolvedValue([
      {
        geographyUnitId: 'district-1',
        parentId: 'state-1',
        geoType: 'DISTRICT',
        geoCode: 'NANDURBAR',
        name: 'Nandurbar',
        status: 'ACTIVE',
        createdByUserId: 'u',
      },
    ] as never);

    const result = await service.getChildren('state-1');

    expect(result).toEqual([
      {
        geographyUnitId: 'district-1',
        parentId: 'state-1',
        geoType: 'DISTRICT',
        geoCode: 'NANDURBAR',
        name: 'Nandurbar',
        status: 'ACTIVE',
      },
    ]);
    expect(result[0]).not.toHaveProperty('createdByUserId');
  });

  it('returns an empty array when the parent exists but has no children', async () => {
    repository.findById.mockResolvedValue({
      geographyUnitId: 'pada-1',
      parentId: 'village-1',
      geoType: 'PADA',
      geoCode: 'PADA-001',
      name: 'Sample Pada',
      status: 'ACTIVE',
    } as never);
    repository.findChildren.mockResolvedValue([]);

    const result = await service.getChildren('pada-1');

    expect(result).toEqual([]);
  });

  it('throws 404 when the parent itself does not exist', async () => {
    repository.findById.mockResolvedValue(null);
    await expect(service.getChildren('missing')).rejects.toMatchObject({ status: 404 });
  });
});

describe('getRoots', () => {
  it('returns the projected top-level units', async () => {
    repository.findRoots.mockResolvedValue([
      {
        geographyUnitId: 'state-1',
        parentId: null,
        geoType: 'STATE',
        geoCode: 'MH',
        name: 'Maharashtra',
        status: 'ACTIVE',
        createdByUserId: 'u',
      },
    ] as never);

    const result = await service.getRoots();

    expect(result).toEqual([
      {
        geographyUnitId: 'state-1',
        parentId: null,
        geoType: 'STATE',
        geoCode: 'MH',
        name: 'Maharashtra',
        status: 'ACTIVE',
      },
    ]);
    expect(result[0]).not.toHaveProperty('createdByUserId');
  });

  it('returns an empty array when no roots are seeded (not an error)', async () => {
    repository.findRoots.mockResolvedValue([]);
    const result = await service.getRoots();
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx jest --config apps/auth-service/jest.config.ts src/geography/geography.service.spec.ts`

Expected: FAIL — `TypeError: service.getChildren is not a function` / `service.getRoots is not a function`.

- [ ] **Step 3: Implement `getChildren` and `getRoots`**

Add to `apps/auth-service/src/geography/geography.service.ts`, inside the `GeographyService`
class, after `getAncestors`:

```typescript
  /**
   * Returns the direct children of `id` (one level down — e.g. all districts under a
   * state). Throws 404 only if `id` itself doesn't exist/is soft-deleted; a valid
   * parent with zero children returns `[]`, which is a normal result, not an error.
   */
  async getChildren(id: string) {
    const parent = await this.repository.findById(id);
    if (!parent) throw notFound('Geography unit not found.');

    const children = await this.repository.findChildren(id);
    return children.map((u) => toApiGeographyUnit(u as unknown as Record<string, unknown>));
  }

  /** Returns all top-level units (no parent, i.e. all STATEs). An empty result is valid. */
  async getRoots() {
    const roots = await this.repository.findRoots();
    return roots.map((u) => toApiGeographyUnit(u as unknown as Record<string, unknown>));
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx jest --config apps/auth-service/jest.config.ts src/geography/geography.service.spec.ts`

Expected: PASS — all tests green (existing 5 + 6 new = 11 total).

- [ ] **Step 5: Commit**

```bash
git add apps/auth-service/src/geography/geography.service.ts apps/auth-service/src/geography/geography.service.spec.ts
git commit -m "feat(geography): add getChildren/getRoots to geography service"
```

---

### Task 3: Controller — register the two new routes

**Files:**

- Modify: `apps/auth-service/src/geography/geography.controller.ts`

**Interfaces:**

- Consumes: `GeographyService.getChildren(id: string)`, `GeographyService.getRoots()`
  (Task 2). Consumes existing `geographyUnitIdParamsSchema`, `geographyUnitSchema`,
  `envelope`, `errorResponse`, `authenticate`, `validate`, `asyncHandler` — all already
  imported/defined in this file; reuse as-is.
- Produces: two new routes mounted on the same `doc` router returned by
  `createGeographyRouter`, so no signature change to the exported function.

No new test file for this task — this repo's existing precedent (confirmed: zero
controller/route-level spec files exist anywhere in `apps/auth-service/src/geography/`
today) is to test business logic at the service layer only, keeping controllers as thin
route registration (root CLAUDE.md §3: "Thin routers; business logic in services").
Task 2's service tests are the enforcement point; this task is verified by a manual
smoke check in Step 2 below.

**Route ordering note:** Express matches routes in registration order. `roots` is a
static path segment and `:id` is a dynamic param — `GET /geography-units/roots` and
`GET /geography-units/:id` do NOT collide (different path depth: `/geography-units/roots`
has one segment after the prefix, `/geography-units/:id` also has one segment, so they
DO overlap positionally). Register `/geography-units/roots` **before**
`/geography-units/:id` so Express doesn't match `roots` as an `:id` value first.

- [ ] **Step 1: Modify the controller**

Read the current file first (shown in full in the design spec's research and above in
this plan's Task discussion — see `apps/auth-service/src/geography/geography.controller.ts`).
Apply this exact change: insert the `roots` route **before** the existing
`/geography-units/:id` route (so it isn't shadowed), and insert the `children` route
after the existing `/geography-units/:id/ancestors` route. The full modified file:

```typescript
import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { GeographyService } from './geography.service';
import {
  asyncHandler,
  authenticate,
  createDocumentedRouter,
  errorResponse,
  ok,
  validate,
} from '../app.module';

extendZodWithOpenApi(z);

const geographyUnitIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }) })
  .strict();

const geographyUnitSchema = z.object({
  geographyUnitId: z.string().uuid().openapi({ example: '99999999-9999-9999-9999-999999999999' }),
  parentId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa' }),
  geoType: z
    .enum(['STATE', 'DISTRICT', 'BLOCK', 'PHC', 'SUBCENTRE', 'VILLAGE', 'PADA'])
    .openapi({ example: 'PHC' }),
  geoCode: z.string().nullable().openapi({ example: 'PHC-001' }),
  name: z.string().openapi({ example: 'Sample PHC' }),
  status: z.enum(['ACTIVE', 'INACTIVE']).openapi({ example: 'ACTIVE' }),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Geography unit master-data HTTP routes (State/District/Block/PHC/Sub-centre/
 * Village/Pada — SRS's 7-level hierarchy). Mounted under the global `api/v1`
 * prefix. Read-only for now: no service owns writes to geography master data
 * yet outside seeding. Open to any authenticated role, same as /lookups —
 * other services (e.g. beneficiary-service resolving a PHC's parent Health
 * Block) call this through the gateway using the original caller's token.
 */
export function createGeographyRouter(service: GeographyService, signer: TokenSigner) {
  const doc = createDocumentedRouter();

  // Registered before `/geography-units/:id` — Express matches routes in
  // registration order, and `:id` would otherwise capture the literal
  // "roots" segment as an id value.
  doc.get(
    '/geography-units/roots',
    {
      summary: 'List all top-level geography units (STATEs — no parent)',
      tags: ['Geography'],
      responses: {
        200: { description: 'Top-level units', schema: envelope(z.array(geographyUnitSchema)) },
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    asyncHandler(async (_req, res) => {
      res.json(ok(await service.getRoots()));
    }),
  );

  doc.get(
    '/geography-units/:id',
    {
      summary: 'Get one geography unit by id',
      tags: ['Geography'],
      params: geographyUnitIdParamsSchema,
      responses: {
        200: { description: 'Geography unit', schema: envelope(geographyUnitSchema) },
        401: errorResponse(401),
        404: errorResponse(404, { message: 'Geography unit not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(geographyUnitIdParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getById(req.params.id)));
    }),
  );

  doc.get(
    '/geography-units/:id/ancestors',
    {
      summary: "Get one geography unit's full ancestor chain, up to STATE",
      tags: ['Geography'],
      params: geographyUnitIdParamsSchema,
      responses: {
        200: {
          description: 'Ancestor chain, ordered from the requested unit up to STATE',
          schema: envelope(z.array(geographyUnitSchema)),
        },
        401: errorResponse(401),
        404: errorResponse(404, { message: 'Geography unit not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(geographyUnitIdParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getAncestors(req.params.id)));
    }),
  );

  doc.get(
    '/geography-units/:id/children',
    {
      summary: 'List the direct children of a geography unit',
      tags: ['Geography'],
      params: geographyUnitIdParamsSchema,
      responses: {
        200: {
          description: 'Direct children of the requested unit (empty array if it is a leaf)',
          schema: envelope(z.array(geographyUnitSchema)),
        },
        401: errorResponse(401),
        404: errorResponse(404, { message: 'Geography unit not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(geographyUnitIdParamsSchema, 'params'),
    asyncHandler(async (req, res) => {
      res.json(ok(await service.getChildren(req.params.id)));
    }),
  );

  return doc;
}
```

- [ ] **Step 2: Manual smoke check (no dedicated controller test file, per existing precedent)**

Run the full geography test suite to confirm nothing broke:

Run: `npx jest --config apps/auth-service/jest.config.ts src/geography`

Expected: PASS — all tests from Tasks 1 and 2 still green (this task made no logic
changes, only route registration, so no new failures are possible from this step alone;
this run is a regression check).

- [ ] **Step 3: Commit**

```bash
git add apps/auth-service/src/geography/geography.controller.ts
git commit -m "feat(geography): expose GET /geography-units/roots and /:id/children routes"
```

---

### Task 4: Full-suite verification and live smoke test

**Files:** None modified — verification only.

**Interfaces:** None — this task consumes the finished feature from Tasks 1–3 and
verifies it end-to-end, both via the automated suite and one real HTTP round-trip
against the locally running stack (if it's up), matching how every other feature in
this project has been verified in this session.

- [ ] **Step 1: Run lint for auth-service**

Run: `npx nx lint auth-service`

Expected: `✔ All files pass linting` — 0 errors, 0 warnings. If warnings appear (e.g.
non-null assertions), fix them in the relevant file from Tasks 1–3 before proceeding.

- [ ] **Step 2: Run the full auth-service test suite**

Run: `npx nx test auth-service`

Expected: all suites pass, including `geography.repository.spec.ts` (4 new tests),
`geography.service.spec.ts` (5 existing + 6 new = 11 tests), and every other
pre-existing auth-service suite (must show 0 regressions).

- [ ] **Step 3: Run the affected-projects check**

Run: `npx nx affected -t lint test --base=main --head=HEAD`

Expected: `auth-service` (and any project depending on it) shows as affected and green.
Note: unrelated projects with zero test files (`wrapper-api-service`,
`cms-content-service`, `reporting-etl-service`) may still fail with "No tests found" —
this is a pre-existing, unrelated condition (confirmed earlier in this project's
history), not a regression from this change. Do not attempt to fix it as part of this
task.

- [ ] **Step 4 (only if the local stack is already running): live smoke test**

Check first whether auth-service is up:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/v1/health/live
```

If this prints `200`, log in and exercise both new endpoints:

```bash
TOKEN=$(curl -s -X POST 'http://localhost:3000/api/v1/auth/login' \
  -H 'Content-Type: application/json' \
  -d '{"username":"test.sakhi","password":"Test@1234"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['accessToken'])")

echo "--- roots ---"
curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/v1/geography-units/roots'

echo "--- children of a known STATE id (replace with a real id from the roots response above) ---"
curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/v1/geography-units/<STATE_ID_FROM_ROOTS>/children'

echo "--- children of a leaf PADA (expect success: true, data: []) ---"
curl -s -H "Authorization: Bearer $TOKEN" 'http://localhost:3000/api/v1/geography-units/<KNOWN_PADA_ID>/children'

echo "--- children of a non-existent id (expect success: false, 404) ---"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Bearer $TOKEN" \
  'http://localhost:3000/api/v1/geography-units/00000000-0000-0000-0000-000000000000/children'
```

Expected: `roots` returns the seeded STATE(s) (e.g. `MH`/Maharashtra per
`apps/auth-service/prisma/seed-data.ts`); `children` of that state returns its district
(e.g. `NANDURBAR`); `children` of a known PADA returns `"data": []` with `200`, not an
error; `children` of a random UUID returns `404`.

If auth-service is NOT running, skip this step — the automated tests in Steps 1–3 are
the required verification; do not start the dev server solely for this task unless the
user asks.

- [ ] **Step 5: Final commit (if Step 4 required no fixes, this is a no-op — nothing to commit)**

If any fixes were needed in Steps 1–4, commit them now with a message describing the
fix (e.g. `fix(geography): correct lint warning in children endpoint`). Otherwise, this
task ends with no new commit — Tasks 1–3's commits are the complete change set.
