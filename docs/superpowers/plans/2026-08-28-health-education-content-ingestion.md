# Health Education Content Ingestion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the real English health-education content ARMMAN has now delivered (`Revised App Form Final 20.3.26 - Health education message.csv`, 32 rows) into `cms-content-service`, and serve it through a new endpoint keyed by risk condition (for `RiskFlag.isEducationTrigger`-driven messages) and by stage (for general/non-risk-triggered education like Primigravida, Breastfeeding, Birth preparedness). Marathi is stored as a literal "Marathi coming soon" placeholder string on every row — not blocked further on ARMMAN's still-pending translation delivery.

**Architecture:** This content does not fit the existing `LearnMoreSection`/`LearnMoreTopic` two-level model (FR-S-13.2's Sections>Topics structure, still just the `COMING_SOON` placeholder) — it's a different shape: long structured body text per condition/stage, ordered multi-message sequences per condition (e.g. Anemia has "message 1" then a later "message 2" at postpartum), and a real (if inconsistent) condition/stage linkage. This plan adds a **new model**, `HealthEducationMessage`, in `cms-content-service` (same service — SRS names it as the Learn More/health-education content owner), separate from `LearnMoreTopic`. It is NOT wired into the existing Learn More sections/topics hierarchy.

`riskConditionId` is a plain nullable scalar column (no Prisma `@relation` — cross-service, per the forklift rule; confirmed as the established pattern via `beneficiary-service`'s own `riskConditionId` column, which has the identical shape and an explicit schema-header comment justifying it). `stage` is stored as free text, copied verbatim from the CSV's `Stage` column — no enum, per explicit product decision (2026-08-28): the ~15 distinct phrases in the source data are not a clean vocabulary, and inventing one now risks being wrong once ARMMAN/product later confirms the real set.

Condition matching (CSV `Condition` text → real `risk_conditions.conditionCode`) is done **by hand**, row by row, per explicit product decision (2026-08-28) — same no-guessing approach used for the earlier Marathi form-label matching. A CSV row with no confident match gets `riskConditionId: null` (general/stage-triggered message, not risk-linked) rather than a forced/wrong match.

**Consumption path:** `risk-referral-service`'s existing `educationContent.client.ts` (added this session, currently always resolves to the `COMING_SOON` Learn More topic) is NOT modified by this plan — wiring `isEducationTrigger` to a SPECIFIC per-condition message from this new model is explicitly a separate follow-up task (per this same 2026-08-28 conversation), not built here. This plan only builds the content storage + a read API in cms-content-service; the risk-referral-service integration is out of scope.

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL — new migration needed, this IS a new relational model, unlike the JSON-blob form-schema work), Zod, Jest.

**Spec:** SRS v3.0 FR-S-5.2(c) ("queues a health education message for display"), Appendix I (Language Support) for the Marathi-placeholder framing. Source content: `Revised App Form Final 20.3.26 - Health education message.csv` (32 rows, confirmed this session to have real English content, an entirely empty Marathi column, and free-text Stage values). No SRS text specifies this content's schema — this plan implements product decisions made in this conversation (2026-08-28): new model (not Learn More), hand-matched condition linkage, verbatim stage text, Marathi placeholder string.

## Global Constraints

- Files ≤ ~250 lines — split by responsibility when larger (root `.claude/CLAUDE.md` §3).
- No `any` — use `unknown` + narrowing (root `.claude/CLAUDE.md` §3).
- Zod `.strict()` schemas for request bodies (root `.claude/CLAUDE.md` §8) — this plan is read-only (no create/update endpoint), so this applies only to any query-param schema added.
- No cross-service DB joins/writes — `riskConditionId` is a plain scalar, no `@relation`, matching `beneficiary-service`'s established precedent for the same cross-service reference (service `.claude/CLAUDE.md` for cms-content-service: "Talk to other services via API/events only").
- `createDocumentedRouter()`/OpenAPI doc blocks on every route (repo convention).
- Jest + ts-jest, tests live beside code as `*.spec.ts` (root `.claude/CLAUDE.md` §12).
- Migration required (new relational model) — must be additive-only, reviewed before applying to any shared environment.

## Verification already completed (do not re-verify)

- `apps/cms-content-service/prisma/schema.prisma` — confirmed current models are only `LearnMoreSection`/`LearnMoreTopic` (placeholder shell, issue #192). No existing model for condition/stage-triggered health-education message content.
- `risk-referral-service`'s `risk_conditions` table — queried live, 48 real rows with `condition_code`/`condition_name`/`phase`. Confirmed the CSV's `Condition` column values only partially and loosely match these (e.g. CSV "Gestational Hypertension" has no exact DB match; CSV "Gestational Diabetes" vs. DB's `GESTATIONAL_DIABETES` labeled "in previous pregnancy" are not obviously the same condition — Task 2 must resolve each case individually, not assume a match from name similarity alone).
- Confirmed ~12 of the CSV's rows/conditions have NO corresponding risk_conditions row at all: Primigravida, Birth preparedness, Danger Signs during Pregnancy (the general checklist, distinct from the risk-linked `DANGER_SIGNS`/`INFANT_DANGER_SIGNS` conditions — verify this distinction carefully in Task 2, the names are similar but the CSV row is framed as a generic "show for all ANC visits" checklist, not a risk-graded condition), Substance Use, Micronutrient Supplementation, Family Planning and Spacing, Nutrition during Pregnancy, Breastfeeding, Neonatal Care, Infant Care: Danger Signs, Infant Care: Immunization, Infant Care: Complementary Feeding, Malnutrition in Infants, POSTPARTUM Counselling (general), Post-miscarriage/abortion/stillbirth, Dehydration. These are general/stage-triggered education, in scope per explicit product decision (2026-08-28) — `riskConditionId: null` for all of these.
- `risk-referral-service`'s `educationContent.client.ts` (this session) — confirmed it always resolves 'COMING_SOON' today; NOT modified by this plan (separate follow-up task).
- `beneficiary-service/prisma/schema.prisma:362`-area — confirmed the exact precedent for a plain-scalar cross-service `riskConditionId` column with no `@relation`, with an explicit schema-header comment justifying the pattern (forklift rule) — same pattern to follow here.

---

## Task 1: Add the `HealthEducationMessage` model

**Files:**

- Modify: `apps/cms-content-service/prisma/schema.prisma`
- Create: migration (via `npx prisma migrate dev` — do not hand-write the SQL)

**Interfaces:**

- Produces: `HealthEducationMessage` Prisma model — fields below.

**Design note (read before starting):** the CSV's row structure has quirks that must be preserved, not "cleaned up":

- A single condition (e.g. Anemia) has MULTIPLE ordered messages shown at different stages (message 1 at "as soon as detected," message 2 at "postpartum") — this is a genuine one-to-many (`Condition` → messages), not a data-entry error. Model each CSV row as one `HealthEducationMessage` row; do not attempt to merge multi-message conditions into one record.
- Several CSV rows have a blank `Condition` cell (e.g. row 2 of the Anemia group, the postpartum follow-up message) — this is intentional: it's a continuation of the immediately-preceding condition's message sequence, not a standalone unlinked message. Task 2's ingestion step must carry the condition forward from the last non-blank row when building the seed data, not treat a blank `Condition` as "no condition"/`riskConditionId: null` by default.
- `S.No` groups related messages (e.g. all "1" rows are Anemia's sequence) — useful as a grouping hint during Task 2's manual matching, not stored as its own column (it's a CSV artifact, not meaningful data).

- [ ] **Step 1: Read the current `LearnMoreTopic` model in full one more time**

Run: `cat apps/cms-content-service/prisma/schema.prisma` — confirm no drift from this plan's Verification section before adding a new model to the same file.

- [ ] **Step 2: Add the model**

Append to `apps/cms-content-service/prisma/schema.prisma`:

```prisma
enum HealthEducationMediaType {
  TEXT
  IMAGE
  AUDIO
  VIDEO
}

// Ingested from ARMMAN's "Revised App Form Final 20.3.26 - Health
// education message.csv" (32 rows, delivered 2026-08-28) — SRS FR-S-5.2(c)
// ("queues a health education message for display"). Distinct from
// LearnMoreSection/LearnMoreTopic (FR-S-13.2's two-level Sections>Topics
// structure, still just a placeholder) — this model's shape (long body
// text, condition/stage linkage, ordered multi-message sequences per
// condition) doesn't fit that hierarchy.
//
// riskConditionId is nullable and a plain scalar with NO Prisma @relation —
// cross-service reference to risk-referral-service's risk_conditions table,
// same pattern beneficiary-service's own riskConditionId column already
// established (forklift rule: no cross-service joins). NULL for
// general/stage-triggered messages with no specific risk condition (e.g.
// Primigravida, Breastfeeding, Birth preparedness) — about a third of the
// source CSV's rows are this kind, confirmed during ingestion (Task 2).
//
// stage is free text, copied verbatim from the CSV's Stage column — NOT an
// enum. The source data's ~15 distinct phrases ("as soon as detected during
// ANC visit", "postpartum (PP1 or PP2 whichever is attended)", "All INC
// visit", "Show this for all the ANC visits", etc.) are not a clean,
// confirmed vocabulary — inventing an enum now risks being wrong once
// ARMMAN/product later confirms the real set (explicit product decision,
// 2026-08-28).
//
// bodyMarathi is a literal "Marathi coming soon" placeholder string on
// every row, not a translated value — ARMMAN's Marathi translation for
// this specific content is still undelivered (confirmed: the source CSV's
// own "Marathi translation" column is entirely empty across all 32 rows).
model HealthEducationMessage {
  id              String                   @id @default(uuid()) @map("health_education_message_id")
  // risk_conditions.risk_condition_id (risk-referral-service) — no
  // @relation, see model doc comment above. NULL for general/stage-only
  // messages.
  riskConditionId String?                  @map("risk_condition_id")
  // Verbatim from the CSV's Condition column, kept even when
  // riskConditionId is set — the CSV's own condition name may differ
  // slightly in wording from risk_conditions.conditionName, and this
  // preserves exactly what ARMMAN actually wrote, for audit/traceability.
  conditionLabel  String                   @map("condition_label") @db.VarChar(200)
  // Verbatim from the CSV's Stage column — see model doc comment.
  stage           String                   @map("stage") @db.VarChar(300)
  // The CSV's "message N" ordering within one condition's sequence (e.g.
  // Anemia: message 1 "as soon as detected", message 2 at postpartum).
  messageOrder    Int                      @map("message_order")
  titleEn         String?                  @map("title_en") @db.VarChar(200)
  bodyEn          String                   @map("body_en")
  // Literal placeholder text, not a real translation — see model doc
  // comment. Never null; every row gets this same placeholder until a real
  // Marathi ingestion pass replaces it.
  bodyMarathi     String                   @default("Marathi content coming soon") @map("body_marathi")
  mediaType       HealthEducationMediaType @default(TEXT) @map("media_type")
  // CSV's Media file column — a bare filename/label today (e.g.
  // "marathi_immunization.mp4"), NOT a resolvable URL. Stored as-is; no
  // CDN/hosting has been set up (confirmed unresolved, out of scope here).
  mediaFile       String?                  @map("media_file") @db.VarChar(200)
  sortOrder       Int                      @default(0) @map("sort_order")
  createdAt       DateTime                 @default(now()) @map("created_at")
  createdByUserId String?                  @map("created_by_user_id")
  updatedAt       DateTime                 @updatedAt @map("updated_at")
  updatedByUserId String?                  @map("updated_by_user_id")
  isDeleted       Boolean                  @default(false) @map("is_deleted")
  deletedAt       DateTime?                @map("deleted_at")

  @@index([riskConditionId])
  @@map("health_education_messages")
}
```

- [ ] **Step 3: Generate and review the migration**

Run: `npx nx run cms-content-service:prisma-migrate -- --name add_health_education_messages` (confirm the exact script name via `cat apps/cms-content-service/package.json` or the root `nx.json`/project config if this exact target name doesn't exist — do not guess a script name that isn't there).

Review the generated SQL: confirm it is additive-only (one new table, one new enum, no drops/alters to `learn_more_sections`/`learn_more_topics`).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit -p apps/cms-content-service/tsconfig.json`
Expected: clean (confirms the generated Prisma client compiles).

- [ ] **Step 5: Commit**

```bash
git add apps/cms-content-service/prisma/schema.prisma apps/cms-content-service/prisma/migrations/
git commit -m "feat(cms-content-service): Add HealthEducationMessage model

New model for ARMMAN's delivered health-education content (32 rows,
'Revised App Form Final 20.3.26 - Health education message.csv') —
distinct from LearnMoreSection/LearnMoreTopic's Sections>Topics
placeholder shell. riskConditionId is a plain nullable scalar (no
Prisma relation, cross-service reference per the forklift rule); stage
is free text, not an enum, since the source data has no confirmed fixed
vocabulary yet. bodyMarathi defaults to a literal placeholder string —
ARMMAN's Marathi translation for this content is still undelivered."
```

---

## Task 2: Ingest the CSV content as seed data

**Files:**

- Create: `apps/cms-content-service/prisma/seed-data/health-education-messages.json`
- Modify: `apps/cms-content-service/prisma/seed.ts`

**Design note (read before starting — this is the largest-risk task):**

This requires going through all 32 CSV rows by hand and, for each:

1. Determine the real `conditionLabel` (carrying forward from the last non-blank `Condition` cell when a row's own cell is blank — see Task 1's design note).
2. Attempt to match `conditionLabel` against the real `risk_conditions` list (queried live this session — 48 rows, condition_code/condition_name/phase). Record the match confidently, or leave `riskConditionId: null` if there's no clear match (most general/education-only rows will have no match — that's expected and correct, not a gap to force-fill).
3. Copy `stage` verbatim from the CSV's Stage column (including the blank-cell-means-continuation-of-prior-stage cases — confirm per row whether a blank Stage cell means "same stage as the row above" or "no stage" by checking the CSV's own grouping; do not assume without checking).
4. Copy `messageOrder` from the CSV's "Message count" column (e.g. "message 1" → `1`).
5. Split the CSV's single `Message` cell into `titleEn` (the message's own bolded/first-line heading, if the source has one — many rows have multiple sub-sections like "Understanding Anemia" / "Local Foods that Increase Blood" within one cell; if a row has multiple distinct sub-headed sections, treat the WHOLE cell as one `bodyEn` rather than trying to split it into separate DB rows — that splitting is a presentation-layer concern, not a data-modeling one for this pass) and `bodyEn` (the full cell content).
6. `bodyMarathi`: leave at the model's default ("Marathi content coming soon") for every row — do not write anything else here.
7. `mediaType`: `TEXT` for every row except any with a real named media file (`marathi_immunization.mp4` → `VIDEO`; confirm the 2-3 other named files' actual type from context, e.g. "anaemia"/"pregnancy danger signs"/"institutional delivery"/"ANC check ups"/"family planning"/"nutrition"/"breastfeeding"/"complementary feeding"/"malnutrition"/"infant danger signs" appear to be bare topic labels, not real filenames with extensions — treat these as `TEXT` with `mediaFile` recorded as-is unless a real, unambiguous media file extension is present).

**Do not invent or paraphrase content.** Every `bodyEn` value must be the CSV's actual text, copied verbatim (matching this plan's own "No Placeholders" constraint) — this task's job is faithful transcription + condition-matching, not authoring new health content.

- [ ] **Step 1: Build the condition-matching table**

Before writing any seed data, produce a mapping table (CSV condition label → risk_conditions.conditionCode or `null`) for all ~20 distinct conditions in the CSV. Use the 48-row `risk_conditions` list from this plan's Verification section. Record uncertain/no-match cases explicitly as `null` — do not guess.

- [ ] **Step 2: Write the seed-data JSON**

Create `apps/cms-content-service/prisma/seed-data/health-education-messages.json` as an array of 32 objects matching `HealthEducationMessage`'s fields (excluding auto-generated `id`/timestamps):

```json
[
  {
    "riskConditionId": null,
    "conditionCode": "ANEMIA",
    "conditionLabel": "Anemia",
    "stage": "as soon as detected during ANC visit",
    "messageOrder": 1,
    "titleEn": null,
    "bodyEn": "Understanding Anemia\nSimple Message: ...",
    "mediaType": "TEXT",
    "mediaFile": "anaemia",
    "sortOrder": 0
  }
]
```

Note: `conditionCode` here (e.g. `"ANEMIA"`) is a temporary seed-time helper field for the seed script to resolve into a real `riskConditionId` UUID at seed-run time (via a lookup query against risk-referral-service's actual seeded rows) — NOT a column on the `HealthEducationMessage` Prisma model itself (Task 1 didn't add one; the model only has `riskConditionId`, a resolved UUID). The seed script (Step 3) is responsible for this resolution.

- [ ] **Step 3: Write the seed script section**

Read `apps/cms-content-service/prisma/seed.ts` in full first (already read this session — confirm no drift), then add a new function alongside `seedPlaceholderContent()`:

```ts
import healthEducationMessages from './seed-data/health-education-messages.json';

/**
 * Ingests ARMMAN's delivered health-education content (2026-08-28).
 * conditionCode in the seed JSON is resolved to a real riskConditionId via
 * a direct query against risk-referral-service's own database — this is
 * the ONE place in this codebase a cross-service DB read happens at
 * seed-time (not at request-time, which would violate the forklift rule);
 * done here only because seeding is a one-time, offline, non-request-path
 * operation with no other services running concurrently in the way a real
 * API call would need to guard against. If risk-referral-service's schema
 * changes this lookup breaks loudly (an unresolved conditionCode throws),
 * not silently.
 */
async function seedHealthEducationMessages(): Promise<void> {
  // NOTE for implementer: confirm whether cross-service DB access at
  // seed-time is actually acceptable in this codebase before writing this
  // function as designed above — check for precedent (grep other
  // services' seed.ts files for any existing cross-database query) before
  // assuming it's fine. If no precedent exists, resolve conditionCode ->
  // riskConditionId by calling risk-referral-service's real HTTP API
  // instead (e.g. GET /risk-conditions), matching this repo's own
  // no-direct-cross-service-DB-access convention, even at seed time.
  for (const message of healthEducationMessages) {
    // ... resolve conditionCode -> riskConditionId, then:
    await prisma.healthEducationMessage.upsert({
      where: {
        /* a natural key — conditionLabel+stage+messageOrder combination, or a fixed seed id if simpler */
      },
      create: {/* ... */},
      update: {},
    });
  }
}
```

**Stop and confirm the cross-service seed-time lookup question above before proceeding** — this plan flags it explicitly rather than assuming an answer, since it's a real architectural question (seed-time convenience vs. forklift-rule consistency) not resolved by any existing precedent found during this session's investigation.

- [ ] **Step 4: Wire into `main()`**

```ts
async function main(): Promise<void> {
  await seedPlaceholderContent();
  await seedHealthEducationMessages();
  console.log('Seeded Learn More placeholder section + topic, and health education messages.');
}
```

- [ ] **Step 5: Run the seed and verify row count**

Run: `npx nx run cms-content-service:prisma-seed` (confirm exact script name against `package.json`, do not guess).

Then verify: `SELECT count(*) FROM health_education_messages;` should return 32. Spot-check 3-4 rows against the source CSV for exact `bodyEn` text match (no paraphrasing introduced).

- [ ] **Step 6: Commit**

```bash
git add apps/cms-content-service/prisma/seed-data/health-education-messages.json apps/cms-content-service/prisma/seed.ts
git commit -m "feat(cms-content-service): Ingest ARMMAN's health-education message content

32 rows from 'Revised App Form Final 20.3.26 - Health education
message.csv', condition-matched by hand against risk-referral-service's
real risk_conditions (<N> of 32 matched to a real riskConditionId, <M>
left null as general/stage-triggered education with no specific risk
condition — list which). stage stored verbatim, no enum. bodyMarathi
defaults to a placeholder string on every row per this feature's
implementation plan doc."
```

---

## Task 3: Serve the content via a new read endpoint

**Files:**

- Create: `apps/cms-content-service/src/health-education/healthEducation.repository.ts`
- Create: `apps/cms-content-service/src/health-education/healthEducation.service.ts`
- Create: `apps/cms-content-service/src/health-education/healthEducation.controller.ts`
- Create: `apps/cms-content-service/src/health-education/healthEducation.routes.ts`
- Create: `apps/cms-content-service/src/health-education/healthEducation.module.ts`
- Test: `apps/cms-content-service/src/health-education/healthEducation.service.spec.ts`
- Modify: `apps/cms-content-service/src/app.module.ts` (register the new module, matching how `learnMore.module.ts` is already registered)

**Interfaces:**

- Produces:
  - `GET /health-education/messages?riskConditionId=<uuid>` — returns all `HealthEducationMessage` rows for that condition, ordered by `messageOrder`.
  - `GET /health-education/messages?stage=<text>` — returns all rows matching that exact stage string (general/education messages have no `riskConditionId` but do have a `stage`).
  - Both params optional independently; at least one SHOULD be provided by a sensible client, but the endpoint does not enforce this — an empty-filter call returns all messages (matches this repo's existing `GET /media`/`GET /learn-more/sections` precedent of "no filter = everything," not an error).
  - Response shape mirrors the Prisma model (minus internal audit columns), matching this repo's existing `toResponse`-style mapper convention (see `mediaAsset.controller.ts`'s `toResponse`/`toFinalizeResponse` for the pattern to follow, even though those trim more fields than this endpoint needs to).

- [ ] **Step 1: Read `learnMore.routes.ts`/`.controller.ts`/`.service.ts`/`.repository.ts`/`.module.ts` in full as the pattern to copy**

This is the closest existing precedent in this exact service — reuse its exact conventions (role list, envelope helper, doc-block shape) rather than inventing new ones.

- [ ] **Step 2: Write the failing test**

Create `apps/cms-content-service/src/health-education/healthEducation.service.spec.ts` (follow `learnMore.service.spec.ts`'s mocked-repository convention):

```ts
import { HealthEducationService } from './healthEducation.service';
import type { HealthEducationRepository } from './healthEducation.repository';

describe('HealthEducationService', () => {
  const repository = {
    findMany: jest.fn(),
  } as unknown as jest.Mocked<HealthEducationRepository>;
  let service: HealthEducationService;

  beforeEach(() => {
    jest.resetAllMocks();
    service = new HealthEducationService(repository);
  });

  it('passes riskConditionId through to the repository', async () => {
    repository.findMany.mockResolvedValue([]);

    await service.listMessages({ riskConditionId: 'condition-1' });

    expect(repository.findMany).toHaveBeenCalledWith({
      riskConditionId: 'condition-1',
      stage: undefined,
    });
  });

  it('passes stage through to the repository', async () => {
    repository.findMany.mockResolvedValue([]);

    await service.listMessages({ stage: 'postpartum (PP1 or PP2 whichever is attended)' });

    expect(repository.findMany).toHaveBeenCalledWith({
      riskConditionId: undefined,
      stage: 'postpartum (PP1 or PP2 whichever is attended)',
    });
  });

  it('passes no filters when neither is given, returning everything', async () => {
    repository.findMany.mockResolvedValue([]);

    await service.listMessages({});

    expect(repository.findMany).toHaveBeenCalledWith({
      riskConditionId: undefined,
      stage: undefined,
    });
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx nx test cms-content-service --testPathPattern="healthEducation.service.spec"`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the repository**

Create `apps/cms-content-service/src/health-education/healthEducation.repository.ts`:

```ts
import type { PrismaService } from '../prisma/prisma.service';

export class HealthEducationRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(filters: { riskConditionId?: string; stage?: string }) {
    return this.prisma.healthEducationMessage.findMany({
      where: {
        isDeleted: false,
        ...(filters.riskConditionId ? { riskConditionId: filters.riskConditionId } : {}),
        ...(filters.stage ? { stage: filters.stage } : {}),
      },
      orderBy: [{ conditionLabel: 'asc' }, { messageOrder: 'asc' }],
    });
  }
}
```

- [ ] **Step 5: Implement the service**

Create `apps/cms-content-service/src/health-education/healthEducation.service.ts`:

```ts
import type { HealthEducationRepository } from './healthEducation.repository';

export class HealthEducationService {
  constructor(private readonly repository: HealthEducationRepository) {}

  listMessages(filters: { riskConditionId?: string; stage?: string }) {
    return this.repository.findMany(filters);
  }
}
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `npx nx test cms-content-service --testPathPattern="healthEducation.service.spec"`
Expected: PASS, all 3 tests.

- [ ] **Step 7: Implement the controller, routes, and module**

Follow `learnMore.controller.ts`/`.routes.ts`/`.module.ts`'s exact shape (read in Step 1). Route: `GET /health-education/messages`, query schema `{ riskConditionId: z.string().uuid().optional(), stage: z.string().trim().min(1).optional() }.strict()`, same roles as Learn More (`SAKHI`, `SUPERVISOR`, `MANAGER`, `ADMIN`).

- [ ] **Step 8: Register the module in `app.module.ts`**

Read `app.module.ts` in full, find where `learnMore.module.ts` is registered, add the equivalent registration for the new health-education module — same pattern, same mount point conventions.

- [ ] **Step 9: Type-check, lint, full test run**

Run: `npx tsc --noEmit -p apps/cms-content-service/tsconfig.json && npx nx lint cms-content-service --skip-nx-cache && npx nx test cms-content-service`
Expected: clean/passing.

- [ ] **Step 10: Live-verify against real seeded data**

With the service running, hit `GET /health-education/messages?riskConditionId=<a real ANEMIA risk_condition_id>` and confirm real Anemia message content comes back, `bodyMarathi` shows the placeholder string, and `stage`/`messageOrder` reflect the CSV correctly. Also hit `GET /health-education/messages?stage=<a general-education stage string>` and confirm a `riskConditionId: null` row comes back correctly.

- [ ] **Step 11: Commit**

```bash
git add apps/cms-content-service/src/health-education/ apps/cms-content-service/src/app.module.ts
git commit -m "feat(cms-content-service): Serve health-education messages via GET /health-education/messages

Filterable by riskConditionId (for risk-triggered messages) and/or
stage (for general/education-only messages with no specific risk
condition) — either, both, or neither (returns everything, matching
this repo's GET /media/GET /learn-more/sections no-filter precedent).

Live-verified against real seeded ARMMAN content."
```

---

## Self-Review

**Spec coverage:** Task asked to implement what's now available (real English content) rather than continuing to wait on ARMMAN's Marathi delivery, with Marathi as a literal placeholder. Task 1 (schema), Task 2 (real content ingestion, hand-matched condition linkage, verbatim stage text, placeholder Marathi), Task 3 (a real, queryable API) together deliver exactly this — content that's genuinely usable today, with an honest, visible placeholder for what's still missing, rather than blocking further.

**Placeholder scan:** Task 1-3's schema/code/test snippets are literal, not placeholders. Task 2 deliberately does NOT give literal transcribed CSV content inline (32 rows of long body text) — a conscious, explained exception per this plan's own "No Placeholders" constraint: this is a hand-transcription/matching task, not something a plan document should pre-fill with guessed content. Task 2 Step 3 explicitly flags an unresolved architectural question (cross-service seed-time DB access) rather than silently assuming an answer — this is a genuine open question flagged honestly, not a placeholder.

**Type consistency:** `HealthEducationMessage`'s Prisma fields (Task 1) match the seed JSON's shape (Task 2, modulo the seed-time-only `conditionCode` helper field, explicitly called out as not a real model column) and the repository/service/controller's filter shape (Task 3: `{ riskConditionId?: string; stage?: string }`, consistent across `findMany`, `listMessages`, and the query schema).

**Explicitly out of scope (confirmed by product decision, 2026-08-28):**

- Wiring `risk-referral-service`'s `isEducationTrigger` to resolve a SPECIFIC message from this new model (still resolves to the generic `COMING_SOON` Learn More placeholder today) — separate follow-up task.
- Real Marathi translation — every row gets the same literal placeholder string.
- A confirmed `stage` enum — stored as free text until product/ARMMAN confirms a real fixed vocabulary.
- Media hosting/CDN for the handful of named media files in the source CSV.
