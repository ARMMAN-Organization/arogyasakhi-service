# Contextual In-Form Learn More Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the confirmed gap in SRS FR-S-13.4 ("Learn More content also accessible contextually within form screens — relevant content appears at the bottom of specific form fields") — the `learnMoreTopicCode` schema hook exists on `formFieldSchema` but is unset on every one of the 12 seeded forms. Set it to the already-live `COMING_SOON` placeholder topic on a curated set of genuinely help-worthy fields, so the contextual-help UI has something real to resolve and display today, rather than remaining an inert, never-exercised hook.

**Architecture:** `FormVersion.schemaJson` is a JSON array of field objects (`prisma/schema.prisma`'s `FormVersion.schemaJson Json`) — `learnMoreTopicCode` is already a valid optional key on `formFieldSchema` (`dto/form-field.dto.ts:147`), added in an earlier session specifically for this purpose. No schema/migration change is needed — this is purely a seed-data content change, setting an existing field's value on specific entries in the existing 12 seed-data JSON files. The mobile client is expected to read a field's `learnMoreTopicCode` and resolve it via cms-content-service's already-live `GET /learn-more/topics/:topicCode` (confirmed working, seeded with the `COMING_SOON` topic, id `66666666-6666-4666-8666-666666666662`) — no new backend resolution endpoint is needed; this plan only supplies the missing data that makes that existing resolution path actually fire for real fields.

Every field this plan touches gets `learnMoreTopicCode: 'COMING_SOON'` — the same shared placeholder topic already serving the Learn More feature generally, per explicit product decision (2026-08-28): real per-field topic codes are still blocked on ARMMAN (SRS Open Item 12), and the fix here is to make the existing contextual-help mechanism exercisable end-to-end today, not to fabricate distinct per-field content that doesn't exist.

**Field selection (explicit product decision, 2026-08-28):** a curated subset of fields across the 12 forms — not all of them, and not a mechanical "every field gets it" pass, since FR-S-13.1 frames Learn More as help for "diagnostic tests and risks," not a caption on every form control. Selected candidates (confirm each still exists with this exact `question_code` before editing — seed data may have shifted since this plan was written):

- `mother-registration.json`: `lmp_date` (LMP is a common source of confusion; drives EDD/gestational-age calculations)
- `anc-visit.json`: `lmp`, `bmi`, `gestational_weight_gain` (clinical/calculated values a Sakhi may need explained)
- `infant-visit.json`: `feeding_concerns`
- `neonatal-visit.json`: `feeding_concerns`, `deformity_observed`, `danger_signs`
- `postpartum-visit.json`: `danger_signs_since_delivery_or_last_visit`

This list is a starting set, not exhaustive — the plan's own Task 1 first step is to re-verify each `question_code` still exists with this exact spelling before editing (seed data changes over time), and flag rather than force any field that's moved or been renamed.

**Tech Stack:** TypeScript, JSON seed data, Zod (existing schema, unchanged). No Prisma/migration work — `schemaJson` is a JSON column.

**Spec:** SRS FR-S-13.4 (contextual in-form Learn More access), FR-S-13.1 ("knowledge base to help Sakhis reference information on diagnostic tests and risks" — the basis for which fields are genuinely in-scope for this help, not a blanket rule). Per SRS Assumptions (line 166)/Open Item 12 (line 601), real per-field topic codes are still blocked on ARMMAN — this plan uses the already-established `COMING_SOON` placeholder pattern instead of waiting further.

## Global Constraints

- Files ≤ ~250 lines — split by responsibility when larger (root `.claude/CLAUDE.md` §3). N/A here — this plan only edits existing JSON seed files, no new source files.
- No `any` — N/A, no new TypeScript code.
- `formFieldSchema`'s existing `.strict()` validation must still pass on every edited seed file — `learnMoreTopicCode` is already a valid key, so this should be a no-op concern, but Task 1's validation step confirms it explicitly rather than assuming.
- No cross-service DB joins/writes — this plan touches only visit-form-service's own seed data.
- No migration — `schemaJson` is a Prisma `Json` column; this is a content-only change.

## Verification already completed (do not re-verify)

- `apps/visit-form-service/src/forms/dto/form-field.dto.ts:140-147` — `learnMoreTopicCode: z.string().trim().min(1).nullable().optional()` already exists on `formFieldSchema`, added in an earlier session. No schema change needed.
- Grepped all 12 files in `apps/visit-form-service/prisma/seed-data/*.json` for `learnMoreTopicCode` — confirmed zero existing usages (this plan is the first to actually set it).
- `apps/cms-content-service`'s `GET /learn-more/topics/:topicCode` — confirmed live, tested, and seeded with the `COMING_SOON` topic (fixed id `66666666-6666-4666-8666-666666666662`, `topicCode: 'COMING_SOON'`, `status: 'ACTIVE'`). No changes needed to cms-content-service for this plan.
- Confirmed via `python3` inspection this session: the field/label lists quoted above for each of the 12 seed-data files, as they existed at plan-writing time (2026-08-28).

---

## Task 1: Set `learnMoreTopicCode` on the curated field list

**Files:**

- Modify: `apps/visit-form-service/prisma/seed-data/mother-registration.json`
- Modify: `apps/visit-form-service/prisma/seed-data/anc-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/infant-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/neonatal-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/postpartum-visit.json`

**Interfaces:**

- No new interfaces — sets an existing, already-typed optional field (`learnMoreTopicCode: string | null | undefined`) to the literal string `'COMING_SOON'` on specific field objects within each file's `schemaJson` array.

- [ ] **Step 1: Re-verify each target `question_code` still exists with this exact spelling**

Run, for each of the 5 files:

```bash
python3 -c "
import json
with open('apps/visit-form-service/prisma/seed-data/<FILE>.json') as f:
    data = json.load(f)
codes = {f['question_code'] for f in data['schemaJson']}
print([c for c in ['<expected_code_1>', '<expected_code_2>'] if c not in codes])
"
```

Expected: an empty list for each file (all target codes exist as spelled in this plan's field-selection list above). If any code is missing/renamed, stop and re-identify the correct current field before proceeding — do not silently skip or guess a replacement.

- [ ] **Step 2: Set `learnMoreTopicCode` on each target field**

For each target field object in each file's `schemaJson` array, add (or set, if somehow already present) the key:

```json
"learnMoreTopicCode": "COMING_SOON"
```

Edit the JSON directly — preserve existing key order/formatting style already used in each file (do not reformat unrelated fields).

- [ ] **Step 3: Validate every edited file still parses against `formFieldSchema`**

Run, for each of the 5 files:

```bash
node -e "
const { schemaJsonSchema } = require('./apps/visit-form-service/src/forms/dto/form-field.dto');
const data = require('./apps/visit-form-service/prisma/seed-data/<FILE>.json');
const result = schemaJsonSchema.safeParse(data.schemaJson);
if (!result.success) { console.error(result.error); process.exit(1); }
console.log('<FILE>.json: valid, ' + data.schemaJson.length + ' fields');
"
```

(This requires the TS to be transpiled or run via `ts-node` — check whether this exact invocation works directly or needs `ts-node -e` instead; do not guess, verify one file's actual working command first before assuming it applies to all 5.)

Expected: valid for every edited file, with the field count UNCHANGED from before editing (confirms no field was accidentally dropped/duplicated — this step only adds a key to existing objects, never adds/removes array entries).

- [ ] **Step 4: Type-check, lint**

Run: `npx tsc --noEmit -p apps/visit-form-service/tsconfig.json && npx nx lint visit-form-service --skip-nx-cache`
Expected: clean (this step is mostly a formality since no `.ts` source changed, but confirms nothing else drifted).

- [ ] **Step 5: Run the existing seed-data / form-field test suite**

Run: `npx nx test visit-form-service --testPathPattern="form-field|seed"` (adjust pattern based on what actually exists — confirm via `find apps/visit-form-service -iname "*seed*spec*" -o -iname "form-field.dto.spec.ts"` first).
Expected: PASS — no existing test should assume `learnMoreTopicCode` is always absent on these specific fields (if one does, it needs a narrower assertion, not a broken test left in place).

- [ ] **Step 6: Live-verify against the running service**

With visit-form-service running, hit `GET /forms/MOTHER_REGISTRATION/active-version` (real auth) and confirm the `lmp_date` field's `schemaJson` entry now includes `"learnMoreTopicCode": "COMING_SOON"`. Repeat for at least one field in `anc-visit.json` (e.g. `bmi`). Then hit `GET /learn-more/topics/COMING_SOON` (already-live endpoint) and confirm it still resolves the placeholder topic — proving the full field → topicCode → resolved-content path is now genuinely exercisable, not just present in isolation.

- [ ] **Step 7: Commit**

```bash
git add apps/visit-form-service/prisma/seed-data/mother-registration.json apps/visit-form-service/prisma/seed-data/anc-visit.json apps/visit-form-service/prisma/seed-data/infant-visit.json apps/visit-form-service/prisma/seed-data/neonatal-visit.json apps/visit-form-service/prisma/seed-data/postpartum-visit.json
git commit -m "feat(visit-form-service): Attach Learn More placeholder to select form fields

SRS FR-S-13.4 (contextual in-form Learn More) had a schema hook
(learnMoreTopicCode, added in an earlier session) but zero seeded
fields actually set it — the mechanism was never exercisable end to
end. Sets learnMoreTopicCode: 'COMING_SOON' (the same already-live
placeholder topic serving Learn More generally) on a curated set of
clinically-relevant fields across 5 forms: lmp_date, lmp, bmi,
gestational_weight_gain, feeding_concerns, deformity_observed,
danger_signs, danger_signs_since_delivery_or_last_visit.

Real per-field topic codes are still blocked on ARMMAN (SRS Open Item
12) — this uses the established placeholder pattern instead of waiting
further, matching this feature's implementation plan doc."
```

---

## Self-Review

**Spec coverage:** FR-S-13.4 asks for contextual in-form Learn More access. The resolution mechanism (mobile client reads `learnMoreTopicCode`, calls `GET /learn-more/topics/:code`) already existed but had no data to resolve. This plan supplies that data on a curated, clinically-justified field set (per FR-S-13.1's own framing of Learn More as help for "diagnostic tests and risks," not a caption on every field) — closing the gap without inventing new backend mechanism that isn't needed.

**Placeholder scan:** No TBD/TODO. Every step has an exact command or exact field list. The field-selection list is explicit and small enough to be fully enumerated in the plan itself (no "etc." or open-ended selection left to the executor's judgment).

**Type consistency:** `learnMoreTopicCode` is not a new type — reuses the existing `z.string().trim().min(1).nullable().optional()` field from `form-field.dto.ts:147`, unchanged. No new interfaces introduced.

**Explicitly out of scope:** real per-field Learn More content (still blocked on ARMMAN); any change to `GET /learn-more/topics/:topicCode` or cms-content-service (already correct, untouched); offline caching of this or any content (a separate, entirely unaddressed requirement — not part of this plan).
