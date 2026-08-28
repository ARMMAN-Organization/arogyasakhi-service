# Form Field Marathi Translations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Store the Marathi translations of form field labels and option labels (ARMMAN-provided, confirmed present in `docs/Arogya_Sakhi_App_Form_Final_31July2026.xlsx.md`) in the backend's existing `FormVersion.schemaJson` structure, and let `GET /forms/:formCode/active-version` return the correct language's `label` text based on a `lang` query param — English by default, Marathi only when explicitly requested.

**Architecture:** `FormVersion.schemaJson` is a JSON array of field objects (`prisma/schema.prisma`'s `FormVersion.schemaJson Json`), validated by `formFieldSchema`/`schemaJsonSchema` (`dto/form-field.dto.ts`). No migration is needed — adding a key to this JSON shape follows the exact precedent `learnMoreTopicCode` already set (added as an optional Zod field to the same schema). This plan has two independent layers:

1. **Storage** — add `labelMarathi` (field-level and per-`options[]`-entry) to the schema, then populate it in the 11 seeded forms from the ARMMAN-provided source.
2. **Serving** — `GET /forms/:formCode/active-version` gains an optional `?lang=en|mr` query param (default `en`, matching the SRS's stated default language). When `lang=mr`, the response's `schemaJson` has each field's/option's `label` **replaced** with `labelMarathi` where present, falling back to the original English `label` where a Marathi translation doesn't exist yet (never omit a label — a missing translation must not mean a missing question). `labelMarathi` itself is a storage-layer detail, not exposed as a second field in the read-endpoint's response — the client always renders whatever `label` says, in whichever language it asked for.

**Explicit design decision (2026-08-28):** this is a **server-picks-by-parameter** approach, not "always return both languages." This was chosen after discussing the trade-off against the SRS's offline-caching requirement (Appendix I: "All content cached on device offline" applies to Learn More; the general form-schema caching expectation is implied by the app's offline-first design elsewhere in the SRS) — the app is expected to pre-fetch and cache `active-version` once per language it needs (e.g. call it twice at sync time, `?lang=en` and `?lang=mr`), not fetch on every toggle. This plan implements the backend half only; the app's own caching-per-language strategy is a mobile-team concern, not built here.

**Only `getActiveVersion` applies language selection.** The 3 authoring/admin endpoints that also call `toApiFormVersion` (`createDraft`, `patchVersion`, `publish`) must continue to return the raw `schemaJson` with BOTH `label` and `labelMarathi` untouched — an admin editing a form needs to see and edit both languages, not have one silently substituted. Localization is therefore implemented as a separate transform applied only in `getActiveVersion`, never inside `toApiFormVersion` itself (which stays a pure, language-agnostic projection, used by all 4 call sites).

**Tech Stack:** TypeScript, Express, Prisma (PostgreSQL, JSON column — no migration), Zod, Jest.

**Spec:** SRS v3.0 Appendix I (Language Support, lines 1789-1800): "Scope: All form questions... UI labels" (this plan covers form questions only), "Primary language: English. Secondary language: Marathi" (line 957) — confirms English as the correct default when no `lang` param is given. No SRS text specifies the API mechanism (query param vs. dual-field response) — this plan implements the explicit product decision made in this conversation (2026-08-28) to use a `lang` query param, matching the existing `activeVersionQuerySchema`'s pattern (already has an `asOf` param).

## Global Constraints

- Files ≤ ~250 lines — split by responsibility when larger (root `.claude/CLAUDE.md` §3).
- No `any` — use `unknown` + narrowing (root `.claude/CLAUDE.md` §3).
- Zod `.strict()` schemas — `formFieldSchema` and `activeVersionQuerySchema` stay `.strict()`; new keys/params must be added to the schema, not silently passed through (root `.claude/CLAUDE.md` §8).
- No cross-service DB joins/writes — entirely within visit-form-service's own `schemaJson` (service `.claude/CLAUDE.md`).
- Jest + ts-jest, tests live beside code as `*.spec.ts` (root `.claude/CLAUDE.md` §12).
- No migration — `schemaJson` is a Prisma `Json` column; adding a key is a content/mapper change, not a schema change.

## Verification already completed (do not re-verify)

- `apps/visit-form-service/src/forms/dto/form-field.dto.ts:54-149` (`formFieldSchema`) — confirmed current shape: `label: z.string()` (field-level, line 66), `options[].label: z.string()` (line 74). `.strict()` at line 149 rejects unknown keys — `labelMarathi` MUST be added here before any seed data can include it. `learnMoreTopicCode` (line 147) is the direct precedent for this kind of addition (optional field, no migration needed since it's JSON).
- `apps/visit-form-service/src/forms/form.routes.ts:29-38` (`activeVersionQuerySchema`) — already has one optional query param (`asOf`), `.strict()`. This is where `lang` gets added.
- `apps/visit-form-service/src/forms/form.controller.ts:15-35` (`getActiveVersion` handler) — destructures `{ asOf, beneficiaryId }` from `req.query`, calls `service.getActiveVersion(formCode, asOf ?? new Date(), req.user.geographyUnitId, authorizationHeader, beneficiaryId)`. `lang` needs to be threaded through this same call.
- `apps/visit-form-service/src/forms/form.service.ts:94-126` (`FormService.getActiveVersion`) — builds `apiVersion` via `toApiFormVersion(version)` (line 103), optionally attaches `prefilledContext` and `geography`. This is where the language-substitution transform must be applied to `apiVersion.schemaJson` before returning — confirmed the only of the 4 `toApiFormVersion` call sites (`form.service.ts:103,208,236,265`) that should apply it; the other 3 (`createDraft`, `patch`→`publish` — verify exact line numbers/method names against current file before editing, this doc's earlier grep found lines 208/236/265) are authoring flows and must NOT localize.
- `apps/visit-form-service/src/forms/form.mapper.ts:32-46` (`toApiFormVersion`) — a pure projection (`FormVersionRow` → API shape), passes `schemaJson`/`validationJson` through as opaque `unknown`. Confirmed this function itself should NOT change — localization is a separate transform layered on top, only in `getActiveVersion`.
- `docs/Arogya_Sakhi_App_Form_Final_31July2026.xlsx.md` — confirmed (this session) to have `| S.No | Data Point (English) | Data Point (Marathi) | Response Choices (English) | Response Choices (Marathi) |` across 9 sheets: Registration_PW_D, ANC visit form, ANC Closure form _D, DeliveryPPNeonatal visit, Infant Registration form, Infant Visits, Infant Closure form, Beneficiary reopen form, Referral form. ~93-100% populated per sampled sheet.
- `apps/visit-form-service/prisma/seed-data/*.json` — 11 form-definition files exist (one more than the xlsx's 9 sheets) — Task 3 must confirm the sheet-to-file mapping before editing, not assume 1:1 correspondence.

---

## Task 1: Add `labelMarathi` to the form field schema

**Files:**

- Modify: `apps/visit-form-service/src/forms/dto/form-field.dto.ts`
- Test: `apps/visit-form-service/src/forms/dto/form-field.dto.spec.ts` (check if it exists first — read in full before adding, to match its existing conventions)

**Interfaces:**

- Produces: `formFieldSchema` gains `labelMarathi: z.string().trim().min(1).optional()` at the field level, and the `options[]` inner object gains the same `labelMarathi: z.string().trim().min(1).optional()`. Both optional — a field with no Marathi content yet must still validate.

- [ ] **Step 1: Check for an existing DTO spec file**

Run: `find apps/visit-form-service/src/forms/dto -iname "form-field.dto.spec.ts"`

If it exists, read it in full before Step 2 — reuse its exact conventions.

- [ ] **Step 2: Write the failing test**

Add (new or existing file) `apps/visit-form-service/src/forms/dto/form-field.dto.spec.ts`:

```ts
import { formFieldSchema, schemaJsonSchema } from './form-field.dto';

describe('formFieldSchema', () => {
  const baseField = {
    question_code: 'test_field',
    label: 'Test Field',
    input_type: 'text',
    required: false,
  };

  it('accepts a field with labelMarathi', () => {
    const result = formFieldSchema.safeParse({ ...baseField, labelMarathi: 'चाचणी फील्ड' });
    expect(result.success).toBe(true);
  });

  it('accepts a field without labelMarathi (optional, backward compatible)', () => {
    const result = formFieldSchema.safeParse(baseField);
    expect(result.success).toBe(true);
  });

  it('accepts an option with labelMarathi', () => {
    const result = formFieldSchema.safeParse({
      ...baseField,
      input_type: 'radio',
      options: [
        { value_code: 'yes', label: 'Yes', labelMarathi: 'होय', sort_order: 0 },
        { value_code: 'no', label: 'No', labelMarathi: 'नाही', sort_order: 1 },
      ],
    });
    expect(result.success).toBe(true);
  });

  it('rejects an empty-string labelMarathi (same rule as label)', () => {
    const result = formFieldSchema.safeParse({ ...baseField, labelMarathi: '' });
    expect(result.success).toBe(false);
  });

  it('schemaJsonSchema (array of fields) still validates a full form with mixed Marathi coverage', () => {
    const result = schemaJsonSchema.safeParse([
      { ...baseField, labelMarathi: 'चाचणी फील्ड' },
      { ...baseField, question_code: 'test_field_2', label: 'No Marathi Yet' },
    ]);
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `npx nx test visit-form-service --testPathPattern="form-field.dto.spec"`
Expected: FAIL — `labelMarathi` is an unrecognized key under `.strict()`.

- [ ] **Step 4: Add the field to the schema**

In `apps/visit-form-service/src/forms/dto/form-field.dto.ts`, add after `label` (line 66):

```ts
    label: z.string().trim().min(1),
    // Marathi translation of `label` — SRS Appendix I (Language Support,
    // lines 1789-1800): "Scope: All form questions... UI labels." Optional
    // since not every field has ARMMAN-provided Marathi content yet.
    // This is a STORAGE field only — GET /forms/:formCode/active-version's
    // ?lang=mr substitutes this INTO `label` at read time (see
    // form.localization.ts); this raw field stays present and untouched in
    // the admin/authoring endpoints (createDraft/patch/publish) so an admin
    // can see and edit both languages. Stored backend-side (this JSON
    // schema) rather than bundled in the mobile app, per explicit product
    // decision (2026-08-28): one source of truth, ARMMAN content updates
    // don't require an app release.
    labelMarathi: z.string().trim().min(1).optional(),
```

And in the `options` array's inner object (after its own `label`, around line 74):

```ts
    options: z
      .array(
        z.object({
          value_code: z.string().trim().min(1),
          label: z.string().trim().min(1),
          labelMarathi: z.string().trim().min(1).optional(),
          sort_order: z.number().int(),
        }),
      )
      .optional(),
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `npx nx test visit-form-service --testPathPattern="form-field.dto.spec"`
Expected: PASS, all 5 tests.

- [ ] **Step 6: Type-check, lint**

Run: `npx tsc --noEmit -p apps/visit-form-service/tsconfig.json && npx nx lint visit-form-service --skip-nx-cache`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add apps/visit-form-service/src/forms/dto/form-field.dto.ts apps/visit-form-service/src/forms/dto/form-field.dto.spec.ts
git commit -m "feat(visit-form-service): Add labelMarathi to form field schema

Stores Marathi translations of form field/option labels server-side in
FormVersion.schemaJson (no migration needed — it's a JSON column).
Optional, additive, backward compatible. This is a storage-layer field
only; Task 2 adds the read-time lang=mr substitution that actually
serves it to clients — admin/authoring endpoints keep returning both
languages untouched.

Follows the same schema-addition pattern learnMoreTopicCode already
established for this same .strict() schema."
```

---

## Task 2: Serve the correct language via `?lang=` on `GET /forms/:formCode/active-version`

**Files:**

- Create: `apps/visit-form-service/src/forms/form.localization.ts`
- Test: `apps/visit-form-service/src/forms/form.localization.spec.ts`
- Modify: `apps/visit-form-service/src/forms/form.routes.ts` (`activeVersionQuerySchema`, doc)
- Modify: `apps/visit-form-service/src/forms/form.controller.ts` (`getActiveVersion` handler)
- Modify: `apps/visit-form-service/src/forms/form.service.ts` (`getActiveVersion` method)
- Modify: `apps/visit-form-service/src/forms/form.service.spec.ts` (existing tests for `getActiveVersion` — verify none break, add new ones)

**Interfaces:**

- Produces: `localizeSchemaJson(schemaJson: unknown, lang: 'en' | 'mr'): unknown` — pure function, no I/O. For `lang: 'en'` (or default), returns `schemaJson` completely unchanged (identity — no `labelMarathi` stripping either; the plan's earlier design intentionally does NOT strip `labelMarathi` from the `en` response, since `formFieldSchema`'s `.strict()` doesn't forbid extra known keys being present, and stripping it would be extra, unnecessary work with no benefit — the client only ever reads `label`). For `lang: 'mr'`, returns a new array where every field's `label` is replaced by its `labelMarathi` when present, otherwise left as the original English `label`; same substitution applied to every entry in that field's `options[]` independently (a field can have `labelMarathi` while an individual option doesn't, or vice versa — each substitution decision is independent, never all-or-nothing per field).
- Consumes: `FormService.getActiveVersion` gains a new parameter `lang: 'en' | 'mr'`, defaulting to `'en'` at the call site (`form.controller.ts`) — NOT defaulted inside the service, so the service's own signature stays explicit about what language it's serving (easier to test, no hidden default to forget).

**Design note (read before starting):** `localizeSchemaJson` must NOT throw or drop a field if `schemaJson` isn't a well-formed array of `FormField`-shaped objects — `schemaJson` is typed `unknown` all the way through this codebase (see `FormVersionRow.schemaJson: unknown` in `form.mapper.ts`) and is not necessarily re-validated by every call path. If an entry doesn't look like a plain object with a `label` key, return it unchanged rather than throwing — matches this file's existing "never fail an otherwise-valid response" philosophy (see `buildFormAnswers`'s doc comment in `form.mapper.ts` for the same stance elsewhere in this service).

- [ ] **Step 1: Read `form.service.ts`'s current `getActiveVersion` and the 3 other `toApiFormVersion` call sites in full**

Run: `grep -n "toApiFormVersion\|async getActiveVersion\|async createDraft\|async patch\|async publish" apps/visit-form-service/src/forms/form.service.ts`

Confirm the exact current line numbers/method names for `createDraft`/`patch`/`publish` (this plan's Verification section found lines 208/236/265 in an earlier pass — re-confirm, since only `getActiveVersion` should apply localization and the other 3 must NOT).

- [ ] **Step 2: Write the failing tests for `localizeSchemaJson`**

Create `apps/visit-form-service/src/forms/form.localization.spec.ts`:

```ts
import { localizeSchemaJson } from './form.localization';

describe('localizeSchemaJson', () => {
  const schemaJson = [
    {
      question_code: 'full_name',
      label: 'Full Name',
      labelMarathi: 'पूर्ण नाव',
      input_type: 'text',
      required: true,
    },
    {
      question_code: 'consent',
      label: 'Did we receive consent?',
      labelMarathi: 'आपल्याला परवानगी मिळाली का?',
      input_type: 'radio',
      required: true,
      options: [
        { value_code: 'yes', label: 'Yes', labelMarathi: 'होय', sort_order: 0 },
        { value_code: 'no', label: 'No', sort_order: 1 }, // no Marathi yet
      ],
    },
    {
      question_code: 'no_marathi_field',
      label: 'English Only Field',
      input_type: 'text',
      required: false,
    },
  ];

  it('returns schemaJson completely unchanged for lang=en', () => {
    expect(localizeSchemaJson(schemaJson, 'en')).toBe(schemaJson);
  });

  it('replaces label with labelMarathi for lang=mr when present', () => {
    const result = localizeSchemaJson(schemaJson, 'mr') as typeof schemaJson;
    expect(result[0].label).toBe('पूर्ण नाव');
    expect(result[1].label).toBe('आपल्याला परवानगी मिळाली का?');
  });

  it('falls back to the original English label for lang=mr when labelMarathi is absent', () => {
    const result = localizeSchemaJson(schemaJson, 'mr') as typeof schemaJson;
    expect(result[2].label).toBe('English Only Field');
  });

  it('substitutes each option label independently, falling back per-option', () => {
    const result = localizeSchemaJson(schemaJson, 'mr') as typeof schemaJson;
    const consentField = result[1] as { options: { value_code: string; label: string }[] };
    expect(consentField.options[0].label).toBe('होय'); // has labelMarathi
    expect(consentField.options[1].label).toBe('No'); // no labelMarathi -> falls back to English
  });

  it('does not mutate the original schemaJson array/objects', () => {
    const original = JSON.parse(JSON.stringify(schemaJson));
    localizeSchemaJson(schemaJson, 'mr');
    expect(schemaJson).toEqual(original);
  });

  it('passes through a malformed entry unchanged rather than throwing', () => {
    const malformed = [null, 'not-an-object', { no_label_key: true }];
    expect(() => localizeSchemaJson(malformed, 'mr')).not.toThrow();
    expect(localizeSchemaJson(malformed, 'mr')).toEqual(malformed);
  });

  it('returns the input unchanged if schemaJson is not an array', () => {
    expect(localizeSchemaJson('not-an-array', 'mr')).toBe('not-an-array');
    expect(localizeSchemaJson(null, 'mr')).toBe(null);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx nx test visit-form-service --testPathPattern="form.localization.spec"`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement `localizeSchemaJson`**

Create `apps/visit-form-service/src/forms/form.localization.ts`:

```ts
/**
 * Substitutes each field's/option's `label` with its `labelMarathi` for
 * `lang: 'mr'`, falling back to the original English `label` when no
 * Marathi translation exists yet for that specific field/option (never
 * omits a question because only its translation is missing). For
 * `lang: 'en'` (the default), returns `schemaJson` completely unchanged —
 * identity, not a copy — since English is already what's stored in `label`.
 *
 * Only ever called from FormService.getActiveVersion (the client-facing
 * read endpoint) — never from the admin/authoring endpoints
 * (createDraft/patch/publish), which must keep returning both `label` and
 * `labelMarathi` untouched so an admin can see/edit both languages.
 *
 * `schemaJson` is typed `unknown` end-to-end in this codebase (see
 * FormVersionRow.schemaJson) and is not guaranteed to be a well-formed
 * FormField[] at this call site — a malformed/unexpected shape is returned
 * unchanged rather than thrown, matching this service's "never fail an
 * otherwise-valid response" stance (see form.mapper.ts's buildFormAnswers).
 */
export function localizeSchemaJson(schemaJson: unknown, lang: 'en' | 'mr'): unknown {
  if (lang === 'en') return schemaJson;
  if (!Array.isArray(schemaJson)) return schemaJson;

  return schemaJson.map((field) => localizeField(field));
}

function localizeField(field: unknown): unknown {
  if (typeof field !== 'object' || field === null) return field;
  const f = field as Record<string, unknown>;

  const localized: Record<string, unknown> = { ...f };
  if (typeof f.labelMarathi === 'string' && f.labelMarathi.length > 0) {
    localized.label = f.labelMarathi;
  }
  if (Array.isArray(f.options)) {
    localized.options = f.options.map((option) => localizeOption(option));
  }
  return localized;
}

function localizeOption(option: unknown): unknown {
  if (typeof option !== 'object' || option === null) return option;
  const o = option as Record<string, unknown>;

  if (typeof o.labelMarathi === 'string' && o.labelMarathi.length > 0) {
    return { ...o, label: o.labelMarathi };
  }
  return o;
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx nx test visit-form-service --testPathPattern="form.localization.spec"`
Expected: PASS, all 7 tests.

- [ ] **Step 6: Add `lang` to the query schema**

In `apps/visit-form-service/src/forms/form.routes.ts`, update `activeVersionQuerySchema` (lines 29-38):

```ts
const activeVersionQuerySchema = z
  .object({
    asOf: z.coerce.date().optional().openapi({ example: '2026-07-20T00:00:00.000Z' }),
    beneficiaryId: z.string().uuid().optional(),
    // SRS Appendix I (Language Support): "Primary language: English.
    // Secondary language: Marathi." Defaults to 'en' when omitted (line
    // 957's stated default) — see form.controller.ts's getActiveVersion
    // handler for where the default is actually applied.
    lang: z.enum(['en', 'mr']).optional().openapi({ example: 'mr' }),
  })
  .strict();
```

Also update the route's doc `responses`/`summary` for `GET /forms/:formCode/active-version` (find via `grep -n "activeVersionQuerySchema" apps/visit-form-service/src/forms/form.routes.ts` to locate the `doc.get` block) to mention the new param — read the existing summary text first and extend it, don't replace it wholesale.

- [ ] **Step 7: Thread `lang` through the controller**

In `apps/visit-form-service/src/forms/form.controller.ts`, update `getActiveVersion`:

```ts
    getActiveVersion: asyncHandler(async (req, res, next) => {
      if (!req.user) return next(unauthorized());
      const authorizationHeader = req.header('authorization');
      if (!authorizationHeader) return next(unauthorized());

      const { formCode } = req.params as unknown as { formCode: string };
      const { asOf, beneficiaryId, lang } = req.query as unknown as {
        asOf?: Date;
        beneficiaryId?: string;
        lang?: 'en' | 'mr';
      };
      const version = await service.getActiveVersion(
        formCode,
        asOf ?? new Date(),
        req.user.geographyUnitId,
        authorizationHeader,
        beneficiaryId,
        lang ?? 'en',
      );
      res.json(ok(version));
    }),
```

- [ ] **Step 8: Apply localization in the service**

In `apps/visit-form-service/src/forms/form.service.ts`, add the import:

```ts
import { localizeSchemaJson } from './form.localization';
```

Update `getActiveVersion`'s signature and body (confirm exact current line numbers via Step 1 before editing — this plan's Verification section found it at lines 94-126):

```ts
  async getActiveVersion(
    formCode: string,
    asOf: Date,
    callerGeographyUnitId: string | null,
    authorizationHeader: string,
    beneficiaryId?: string,
    lang: 'en' | 'mr' = 'en',
  ) {
    const version = await this.repository.findActiveVersion(formCode, asOf);
    if (!version) throw notFound(`No published form version found for form code "${formCode}".`);
    const apiVersion = {
      ...toApiFormVersion(version),
      schemaJson: localizeSchemaJson(version.schemaJson, lang),
    };

    // ... rest of the method unchanged (prefilledContext, geography, etc.) ...
```

Note the default `lang: 'en' = 'mr'` at the SERVICE level too (not just the controller) — defensive, since this method could in principle be called from elsewhere in the future without a lang argument; matches this codebase's general preference for explicit-but-defaulted parameters over implicit undefined-handling deeper in the call chain.

- [ ] **Step 9: Run `form.service.spec.ts`'s existing `getActiveVersion` tests to confirm none broke**

Run: `npx nx test visit-form-service --testPathPattern="form.service.spec"`
Expected: PASS — the default `lang: 'en'` means `localizeSchemaJson(schemaJson, 'en')` returns `schemaJson` unchanged (identity), so every existing assertion on the shape of `apiVersion.schemaJson` should still hold. If any existing test asserts `apiVersion.schemaJson === version.schemaJson` (reference equality) rather than deep-equality, that specific assertion needs updating — this diff wraps `apiVersion` in a new object even for `lang: 'en'` (`{ ...toApiFormVersion(version), schemaJson: ... }`), even though `schemaJson`'s own value is unchanged.

- [ ] **Step 10: Add new tests for the `lang=mr` path in `form.service.spec.ts`**

Read the existing `getActiveVersion` describe block in full first (to match its exact mocking conventions — repository/beneficiary-client mocks), then add:

```ts
it('returns Marathi labels when lang=mr is requested', async () => {
  repository.findActiveVersion.mockResolvedValue({
    // ...existing fixture shape, plus:
    schemaJson: [
      {
        question_code: 'q1',
        label: 'English Label',
        labelMarathi: 'मराठी लेबल',
        input_type: 'text',
        required: false,
      },
    ],
  } as never);

  const result = await service.getActiveVersion(
    'SOME_FORM',
    new Date(),
    null,
    AUTH_HEADER,
    undefined,
    'mr',
  );

  expect((result.schemaJson as { label: string }[])[0].label).toBe('मराठी लेबल');
});

it('defaults to English when lang is omitted', async () => {
  repository.findActiveVersion.mockResolvedValue({
    schemaJson: [
      {
        question_code: 'q1',
        label: 'English Label',
        labelMarathi: 'मराठी लेबल',
        input_type: 'text',
        required: false,
      },
    ],
  } as never);

  const result = await service.getActiveVersion('SOME_FORM', new Date(), null, AUTH_HEADER);

  expect((result.schemaJson as { label: string }[])[0].label).toBe('English Label');
});
```

(Adjust the fixture shape to match whatever `findActiveVersion`'s mock return value looks like elsewhere in this same spec file — do not invent a new fixture shape inconsistent with the file's existing ones.)

- [ ] **Step 11: Confirm the 3 authoring endpoints are unaffected**

Run: `npx nx test visit-form-service --testPathPattern="form.service.spec"` again, specifically checking `createDraft`/`patch`/`publish`'s existing tests still pass unmodified — these must NOT have gained a `lang` parameter or any localization behavior. If any of their tests were accidentally touched by this diff, revert those specific changes.

- [ ] **Step 12: Type-check, lint, full test run**

Run: `npx tsc --noEmit -p apps/visit-form-service/tsconfig.json && npx nx lint visit-form-service --skip-nx-cache && npx nx test visit-form-service`
Expected: clean/passing, all suites.

- [ ] **Step 13: Commit**

```bash
git add apps/visit-form-service/src/forms/form.localization.ts apps/visit-form-service/src/forms/form.localization.spec.ts apps/visit-form-service/src/forms/form.routes.ts apps/visit-form-service/src/forms/form.controller.ts apps/visit-form-service/src/forms/form.service.ts apps/visit-form-service/src/forms/form.service.spec.ts
git commit -m "feat(visit-form-service): Serve Marathi form labels via ?lang=mr on active-version

GET /forms/:formCode/active-version accepts an optional lang=en|mr
query param (default en, matching the SRS's stated default language).
For lang=mr, every field's and option's label is substituted with its
labelMarathi where present, falling back to English where a
translation doesn't exist yet — never omits a question over a missing
translation.

Localization is applied only in getActiveVersion (the client-facing
read endpoint), never in the 3 admin/authoring endpoints
(createDraft/patch/publish), which keep returning both label and
labelMarathi untouched so an admin can edit both languages.

Explicit product decision (2026-08-28): server-picks-by-parameter
rather than always-return-both-languages, with the app expected to
pre-fetch/cache active-version once per language it needs to support
offline toggling, rather than fetching per-toggle."
```

---

## Task 3: Populate seed data with real Marathi content

**Files:**

- Modify: `apps/visit-form-service/prisma/seed-data/mother-registration.json`
- Modify: `apps/visit-form-service/prisma/seed-data/anc-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/anc-closure-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/delivery-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/postpartum-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/neonatal-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/child-registration.json`
- Modify: `apps/visit-form-service/prisma/seed-data/infant-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/child-closure-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/beneficiary-reopen-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/referral-visit.json`
- Modify: `apps/visit-form-service/prisma/seed-data/referral-followup-visit.json`
- Test: existing `*.spec.ts` files covering seed-data validity (find via `find apps/visit-form-service -iname "*seed*spec*"`)

**Design note (read before starting — this is the largest-risk task, and it's the one that makes Tasks 1-2 actually useful):**

This task requires matching each `question_code` in each seed-data JSON file to its corresponding row in `docs/Arogya_Sakhi_App_Form_Final_31July2026.xlsx.md` by the English `label`/`Data Point (English)` text, then copying across the `Data Point (Marathi)` value as `labelMarathi`, and each option's `Response Choices (Marathi)` value as that option's `labelMarathi`. This is NOT a mechanical 1:1 line mapping — the xlsx's 9 sheets and the 11 seed-data files don't necessarily correspond one-to-one, option ordering may differ, and English label wording may not match verbatim between the two sources.

Because of this, **do not attempt to script/automate this matching** — do it field-by-field, by hand, cross-referencing the actual English text. For any `question_code` where the seed data's English label does NOT have a clear, confident match in the xlsx, leave `labelMarathi` absent (it's optional) rather than guessing — a missing translation is a visible, honest gap; a wrong translation is a silent, harmful one for a Sakhi relying on it in the field.

- [ ] **Step 1: Build the sheet-to-seed-file mapping**

Read `docs/Arogya_Sakhi_App_Form_Final_31July2026.xlsx.md`'s sheet index in full, and compare each sheet name against the 11 seed-data file names. Record a mapping table (sheet name -> seed file name) before touching any file — if a sheet doesn't clearly map to a seed file (or vice versa), note it and skip that file's Marathi population in this task (flag for a follow-up) rather than guessing.

- [ ] **Step 2: For each mapped seed file, read both sides side by side**

For each seed-data JSON file: read its `schemaJson` array in full, and read the corresponding xlsx sheet's table in full. For each field object in the JSON:

- Find the xlsx row whose "Data Point (English)" matches this field's `label` (allow for minor wording/punctuation differences, but require the match to be unambiguous).
- If matched: add `labelMarathi` with the xlsx's "Data Point (Marathi)" value.
- If the field has `options`, match each option's `label` against the xlsx's "Response Choices (English)" list for that same row and add each option's `labelMarathi` from "Response Choices (Marathi)".
- If no confident match: leave `labelMarathi` absent on that field/option, do not guess.

- [ ] **Step 3: Validate every edited file still parses against `schemaJsonSchema`**

After editing each seed-data JSON file, confirm it still validates via the pattern used by the existing seed-data test file (found in Step 1's earlier `find`) — do not invent a new validation mechanism.

Expected: valid for every edited file, with the field count unchanged from before editing (confirms no field was accidentally dropped/duplicated).

- [ ] **Step 4: Run the existing seed-data test suite**

Run: `npx nx test visit-form-service --testPathPattern="seed"` (adjust pattern to match whatever Step 1's `find` located)
Expected: PASS.

- [ ] **Step 5: Type-check, lint, full test run**

Run: `npx tsc --noEmit -p apps/visit-form-service/tsconfig.json && npx nx lint visit-form-service --skip-nx-cache && npx nx test visit-form-service`
Expected: clean/passing.

- [ ] **Step 6: Live-verify `?lang=mr` against real seeded content**

With the service running, hit `GET /forms/MOTHER_REGISTRATION/active-version?lang=mr` (through the gateway, real auth) and confirm at least one field's `label` comes back in Marathi, matching what was entered in Step 2. Also hit the same endpoint without `?lang=` and confirm it's unchanged (English).

- [ ] **Step 7: Commit**

```bash
git add apps/visit-form-service/prisma/seed-data/*.json
git commit -m "feat(visit-form-service): Populate form fields with ARMMAN-provided Marathi translations

Adds labelMarathi to seeded form fields and options, sourced from
docs/Arogya_Sakhi_App_Form_Final_31July2026.xlsx.md's 'Data Point
(Marathi)'/'Response Choices (Marathi)' columns. Matched by hand,
field-by-field, against each seed file's English label text — a field
with no confident match in the xlsx is left without labelMarathi
(optional field) rather than guessed.

Live-verified: GET .../active-version?lang=mr returns the Marathi
labels for seeded fields; omitting ?lang= (or lang=en) is unchanged.

<list which seed files got full/partial/no Marathi coverage and why,
per Task 1's mapping step, so the gap is visible in history — do not
claim 100% coverage if it isn't>"
```

---

## Self-Review

**Spec coverage:** Requirement was "form UI translation — where do I store it, and how does the client get the right language." Product decisions (2026-08-28): store backend-side (Task 1), serve via `?lang=` query param rather than always-both (Task 2), populate from the real ARMMAN source (Task 3). Together these deliver "form questions" scope of SRS Appendix I's Language Support requirement, with English as the confirmed default (line 957). Health-education-message translations are explicitly NOT in scope (confirmed absent from the source document; tracked separately, still ARMMAN-blocked).

**Placeholder scan:** No TBD/TODO in Tasks 1-2 — literal schema/function/test code given throughout. Task 3 deliberately does NOT give literal field-by-field translations inline (hundreds of fields across 11 files) — a conscious, explained exception: fabricating example mappings would be actively worse than an explicit manual-matching procedure, since placeholder text here risks being mistaken for real ARMMAN content.

**Type consistency:** `labelMarathi: z.string().trim().min(1).optional()` defined once (Task 1), consumed identically by `localizeSchemaJson` (Task 2) and Task 3's population work (validated against the same `schemaJsonSchema` Task 1 exports). `localizeSchemaJson(schemaJson: unknown, lang: 'en' | 'mr'): unknown` defined once (Task 2 Step 4), imported and called identically in `form.service.ts` (Step 8) and tested identically in its own spec (Step 2) and `form.service.spec.ts`'s new tests (Step 10). `lang: 'en' | 'mr'` as a type appears consistently at the query schema (Task 2 Step 6), controller (Step 7), service signature (Step 8), and both spec files.
