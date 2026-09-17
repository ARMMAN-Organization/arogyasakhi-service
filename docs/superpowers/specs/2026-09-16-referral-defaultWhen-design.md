# `defaultWhen` — auto-defaulted hidden fields (REFERRAL_VISIT fix)

## Problem

REFERRAL_VISIT's field 6 (`referral_declined_reason`, "If No, state reasons")
must be reachable from two branches per the source form spec
(`docs/Revised_App_Form_Final_20.3.26.xlsx.md` rows 4-6):

- Field 4 (`referral_needed_new_condition`) = No → "go to 6 and stop"
- Field 4 = Yes, Field 5 (`beneficiary_willing_for_referral`) = No →
  "complete 6 and stop"

Today, field 6's `visibleWhen` only checks field 5 (`beneficiary_willing_for_referral = no`).
Field 5 itself is only visible when field 4 = Yes. So when field 4 = No,
field 5 never renders, its value stays null, and field 6's condition can
never be satisfied — field 6 has no path to appear from the field-4-No
branch. Confirmed by the mobile team's `DynamicVisitFormViewModelTest.kt`
fixture.

The visibility engine (`FormVisibilityEvaluator.kt` on the client,
`form-validation.ts`'s `isVisible` on the server — deliberately mirrored,
per that code's own doc comment) only evaluates one `{field, operator,
value}` condition per field. An array-of-conditions shape was tried once
before and is now explicitly banned at the schema level
(`form-field.dto.ts`'s `visibleWhen` comment) after it crashed the mobile
app for every Sakhi on every ANC_VISIT/INFANT_VISIT form load.

## Decision

Field 6 stays wired exactly as it is today (`visibleWhen: field_5 = no`).
Instead, when field 4 = No, field 5's _value_ is silently defaulted to
`"no"` — without ever showing field 5 to the Sakhi — so field 6's existing
condition fires naturally. This needs one new, generic capability: a field
can declare that its value defaults to a fixed value when another field's
condition is met and the field itself has no direct answer.

## New DSL field: `defaultWhen`

Sibling to `visibleWhen` on `formFieldSchema`
(`apps/visit-form-service/src/forms/dto/form-field.dto.ts`):

```ts
defaultWhen: z.object({
  field: z.string().trim().min(1),
  operator: z.enum(['eq', 'gte', 'lt', 'isSet', 'contains']), // same set as visibleWhenConditionSchema
  value: z.any().openapi({ type: 'object' }).optional(),
  defaultValue: z.any().openapi({ type: 'object' }),
}).optional();
```

Reuses `visibleWhenConditionSchema`'s exact condition shape and operator
set — no new comparison logic, just an added `defaultValue`.

### Semantics

For a field with `defaultWhen`:

- If the trigger condition (`{field, operator, value}`) evaluates true
  against the current formData, AND this field's own answer is currently
  empty (`isEmpty`), its value is set to `defaultValue`.
- If the Sakhi has directly answered this field, the real answer always
  wins — `defaultWhen` never overwrites an existing value.
- `defaultWhen` is independent of `visibleWhen`. A field keeps its own
  visibility rule untouched; defaulting only affects what value ends up in
  formData when the field is (and stays) hidden.

### Where it runs

Both client and server apply the identical normalization, matching this
codebase's existing "mirrored engine, not one delegating to the other"
convention:

- **Client** (sakhi-mobile-app, out of this repo): before building the
  submission payload, apply `defaultWhen` for every field that declares it.
- **Server**: a new normalization pass over `dto.formData`, run inside
  `FormService.createSubmission` — **before** `validateSubmission` — so
  the defaulted value participates in required-field checks (specifically,
  field 6's `visibleWhen: field_5=no` sees the defaulted `"no"` and treats
  it exactly like a direct answer) and is what actually gets persisted via
  `buildFormAnswers`/`formDataJson`.

This is the same defense-in-depth stance the rest of `form-validation.ts`
already takes (server re-validates everything the client is expected to
have already validated, never trusts the client's computed state blindly).
Applying the default server-side also means a submission from an
older/not-yet-updated mobile app version — or a client-side bug — still
gets a correct default rather than silently failing REFERRAL_VISIT
submissions with `have_you_done...` — er, with `beneficiary_willing_for_referral`
missing.

## Scope of this change

**In scope (this repo, visit-form-service):**

- `defaultWhen` added to `formFieldSchema` (form-field.dto.ts)
- New `applyDefaults(fields, formData)` function in `form-validation.ts`
  (or a new sibling module) — pure function, same style as `isVisible`
- Wired into `FormService.createSubmission`, before `validateSubmission`
- REFERRAL_VISIT schema: `beneficiary_willing_for_referral` gains
  `defaultWhen: { field: 'referral_needed_new_condition', operator: 'eq', value: 'no', defaultValue: 'no' }`
- New form version (v-next) created, patched, and published via the
  existing admin API (`POST/PATCH/POST .../versions/:id/publish`), same
  procedure as the prior ANC_VISIT USG fix — applied against both the
  local dev DB and the shared dev Supabase DB, per the user's explicit ask
  ("implement this in local and dev")

**Out of scope (separate repo, not built here):**

- `FormVisibilityEvaluator.kt`'s corresponding client-side implementation
  in sakhi-mobile-app. Until the mobile app ships this, a Sakhi on an
  un-updated app build will still see field 6 fail to appear in the
  field-4=No branch (client-side visibility only checks `visibleWhen`,
  which is unchanged) — but any submission that DOES reach the server with
  field 5 missing and field 4=No will now be correctly defaulted and
  accepted, rather than failing validation. This is flagged explicitly to
  the mobile team as a follow-up, not silently dropped.

## Risk

Strictly additive: `defaultWhen` absent on a field is a complete no-op —
every existing form/field is unaffected. Does not touch `visibleWhen`'s
shape, the array-rejection guard, or the visibility evaluator's existing
logic — a new, independent pre-processing step, not a modification of the
mechanism that caused the prior incident.

## Testing

- `form-field.dto.spec.ts`: `defaultWhen` accepts a valid condition +
  defaultValue; rejects a malformed one (missing `field`/`operator`/`defaultValue`)
- New `applyDefaults` unit tests: applies default when condition true and
  field empty; does NOT overwrite an existing answer; no-op when condition
  false; no-op when field has no `defaultWhen`
- `form.service.spec.ts` / `createSubmission`: a REFERRAL_VISIT submission
  with `referral_needed_new_condition: 'no'`, `referral_declined_reason`
  answered, and `beneficiary_willing_for_referral` OMITTED from the payload
  → submission succeeds, persisted `formDataJson` contains
  `beneficiary_willing_for_referral: 'no'`
- Regression: existing field-4=Yes → field-5=No → field-6 path is
  unaffected (field 5 answered directly, default never applies since the
  field isn't empty)
- Regression: field-4=Yes → field-5=Yes path (field 6 never required)
  unaffected
- Live verification: create+publish a new REFERRAL_VISIT version via the
  admin API against local DB, submit the field-4=No payload via a real
  HTTP call, confirm 201 with the defaulted field persisted; repeat against
  the shared dev Supabase DB
