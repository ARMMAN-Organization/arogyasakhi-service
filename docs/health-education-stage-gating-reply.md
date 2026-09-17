# Reply — Stage-triggered gating (Path B), for offline replication

Verified directly against `healthEducationStage.resolver.ts`, `form.service.ts`, and `libs/core/src/date.util.ts` — not against your table. One finding up front that changes how you should build this.

---

## Read this first: `submittedAt` is server clock, not visit time

`resolveStageEducationContentForSubmission` (`form.service.ts:737`) computes gestational age and infant age using `visitDateIso = submittedAt.toISOString()`, and `submittedAt` is set as `new Date()` at row-insert time (`form.repository.ts:337`) — **the moment the server actually receives and writes the submission, not when the Sakhi filled it out.**

For an offline-queued visit that syncs hours or days later, the server's own GA/age calculation would be computed against the wrong date — it doesn't know or use the real visit date at all today. This is exactly why you need to replicate the gate on-device: **the server-side version of this logic cannot be trusted for a delayed-sync visit**, not just "is slow to respond." Build your on-device gate against the true local visit timestamp, not `submittedAt`.

---

## Row-by-row verification

| Topic                                             | Form code                           | Your description                                                        | Verified                                                                                                                                                 |
| ------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Primigravida                                      | ANC_VISIT                           | GA-gated 13–20wk, first ANC visit only                                  | **Confirmed exactly.** `minWeek: 13, maxWeek: 20, firstVisitOnly: true`                                                                                  |
| Birth preparedness                                | ANC_VISIT                           | GA-gated 21–30wk                                                        | **Confirmed exactly.** `minWeek: 21, maxWeek: 30`                                                                                                        |
| Danger Signs during Pregnancy                     | ANC_VISIT                           | Unconditional, every ANC visit                                          | **Confirmed.** `UNCONDITIONAL_STAGES_BY_FORM.ANC_VISIT`                                                                                                  |
| Substance Use During Pregnancy                    | ANC_VISIT                           | GA-gated 13–26wk                                                        | **Confirmed exactly.** `minWeek: 13, maxWeek: 26`                                                                                                        |
| Micronutrient Supplementation and Preventive Care | ANC_VISIT                           | GA-gated 13–22wk                                                        | **Confirmed exactly.** `minWeek: 13, maxWeek: 22`                                                                                                        |
| Family Planning and Spacing                       | ANC_VISIT                           | GA-gated 31–35wk                                                        | **Confirmed exactly.** `minWeek: 31, maxWeek: 35`                                                                                                        |
| Nutrition during Pregnancy                        | ANC_VISIT                           | GA-gated 17–22wk                                                        | **Confirmed exactly.** `minWeek: 17, maxWeek: 22`                                                                                                        |
| Breastfeeding                                     | ANC_VISIT                           | GA-gated 31–40wk                                                        | **Confirmed exactly.** `minWeek: 31, maxWeek: 40`                                                                                                        |
| Neonatal Care                                     | NEONATAL_VISIT                      | Unconditional, NN1 and NN2                                              | **Confirmed.** `UNCONDITIONAL_STAGES_BY_FORM.NEONATAL_VISIT` — one stage string (`'NN1 and NN2'`) covers both, no NN1-vs-NN2 differentiation server-side |
| Infant Care: Danger Signs                         | INC_VISIT                           | Unconditional, every INC visit                                          | **Confirmed.** `UNCONDITIONAL_STAGES_BY_FORM.INC_VISIT`                                                                                                  |
| Infant Care: Immunization                         | INC_VISIT                           | Unconditional, every INC visit (VIDEO type)                             | **Confirmed unconditional.** Media type is a catalog-row property, not a gating concern — confirmed separately in the seed data, not this resolver       |
| Infant Care: Complementary Feeding                | INC_VISIT                           | Age-gated 6–10 months                                                   | **Confirmed exactly.** `minMonth: 6, maxMonth: 10`                                                                                                       |
| Malnutrition in Infants                           | INC_VISIT                           | Unconditional, every INC visit                                          | **Confirmed.** Same `UNCONDITIONAL_STAGES_BY_FORM.INC_VISIT` bucket as Danger Signs/Immunization                                                         |
| POSTPARTUM Counselling (×2 messages)              | POSTPARTUM_VISIT                    | Unconditional, every PP visit                                           | **Confirmed.** `UNCONDITIONAL_STAGES_BY_FORM.POSTPARTUM_VISIT` — both messages fire together, no PP1/PP2/.../PP5-sequence differentiation                |
| Post miscarriage/abortion/stillbirth              | ANC_CLOSURE_VISIT or DELIVERY_VISIT | closure_reason = miscarriage/abortion, or a recorded stillbirth outcome | **Confirmed, with one gating condition you're missing** — see below                                                                                      |
| Dehydration                                       | ANC_VISIT                           | GA-gated 13–40wk (every 2nd/3rd trimester visit)                        | **Confirmed exactly.** `minWeek: 13, maxWeek: 40`                                                                                                        |

**Every GA/age threshold in your table is byte-for-byte correct.** Nothing to correct on the numbers.

**One real correction — the closure-reason row has a gate your table doesn't show:**
`closureReasonCode` is only read from the submission at all when `continue_with_closure === 'yes'` (`form.service.ts:770-786`). If a Sakhi selects `closure_reason: 'miscarriage'` but `continue_with_closure` is anything other `'yes'` (including unset), the Post-loss content does **not** fire — the field is deliberately ignored, specifically to avoid firing on a hidden-but-still-submitted form field (a known mobile UX gap flagged in PR #222 review, quoted directly in the code comment). Replicate this exact precondition: check `continue_with_closure === 'yes'` before evaluating `closure_reason` against the loss set.

The two exact loss-reason codes: `'miscarriage'`, `'abortion_spontaneous_induced_mtp'` (`LOSS_CLOSURE_REASONS`, `healthEducationStage.resolver.ts`).
The two exact stillbirth-outcome codes (checked across `child1/2/3_delivery_outcome`): `'antepartum_still_birth_fresh'`, `'intrapartum_still_birth_macerated'` (`STILLBIRTH_OUTCOMES`).

---

## Exact comparison semantics (item 2)

**Gestational age — weeks, not days, and floored:**

```
days = Math.floor((visitDate.getTime() - lmpDate.getTime()) / MS_PER_DAY)   // raw ms diff, NOT calendar-day-safe
weeks = Math.floor(days / 7)
```

- If `days < 0` (visit predates LMP) → `undefined`, gate simply doesn't apply, no error.
- **Boundaries are inclusive on both ends**: `minWeek <= weeks <= maxWeek`. Example: `20w0d` through `20w6d` all satisfy `maxWeek: 20`; `21w0d` does not.
- **Not calendar-day-safe**: the diff uses raw `Date.getTime()` millisecond subtraction, not a UTC-midnight-normalized day boundary (there's a `startOfUTCDay()` helper in the same shared lib that isn't used here). If `lmpDate` and `visitDate` carry different time-of-day components, you can get an off-by-one day near a boundary depending on time zone/time-of-day handling on your side. Recommend normalizing both to midnight UTC before diffing on-device to avoid drift from this server behavior — or match this exact (not-fully-safe) behavior if you need byte-identical results including its edge case.
- `lmpDate` source: `MOTHER_REGISTRATION`'s `lmp_date` answer, a plain date string.

**Infant age — whole months, calendar-based, not days/30:**

```js
months =
  (visit.getUTCFullYear() - birth.getUTCFullYear()) * 12 +
  (visit.getUTCMonth() - birth.getUTCMonth());
if (visit.getUTCDate() < birth.getUTCDate()) months -= 1;
months = Math.max(0, months);
```

- This is real calendar-month arithmetic (like "how old is this baby in whole months," the way a person would count it) — **not** `daysDiff / 30`. Replicate the exact algorithm above, not an approximation, or you'll drift near month boundaries.
- **Boundaries inclusive**: `minMonth <= months <= maxMonth`. `6` and `10` are both included for Complementary Feeding.
- If `visit < birth` → `undefined`, gate doesn't apply.

**"First visit only" (Primigravida):** not date-based at all — it's `count of prior ANC_VISIT submissions for this beneficiary === 1`, counted by submission _insertion order_ (`createdAt <= asOfCreatedAt`), not visit-date order. On an offline device with the real chronological visit history, you should compute "is this the first ANC_VISIT I've ever recorded for this beneficiary" directly — but be aware the server's own concept of "first" could disagree with yours if two offline visits sync out of chronological order (whichever one lands on the server first becomes the server's "first," even if a phone recorded an earlier one that just synced later). This is a real, currently-unresolved divergence risk between your on-device gate and the server's — flagging it, not hiding it.

---

## Structured data (item 3)

**This is not currently exposed as data anywhere — it's hardcoded as a TypeScript array literal** (`GA_GATED_STAGES` in `healthEducationStage.resolver.ts`), directly in the resolver file, in `apps/visit-form-service`. It is not a database table, not a JSON config file, not a CMS-managed value. There is no existing mechanism to add fields to a response and expose this as consumable data without deliberately building one.

Given that, mirroring the table above **is a reasonable interim approach** — the values you'd hardcode are the exact, complete, currently-shipping thresholds, verified line-by-line above, not guessed. I'm not going to build the structured-export API in this pass (that's a real feature, needs its own scoping — likely a new endpoint or fields added to the existing catalog response), but the table above is a legitimate, current snapshot to build against today.

---

## Is this expected to change without an app release? (item 4)

**No — this is static, hardcoded application code, not a rule pack.** Unlike GoRules risk-grading (which is explicitly designed to be edited/redeployed independently of the app), these GA/age thresholds live directly in a TypeScript file in this service and only change via a code change + deploy of `visit-form-service`. There is no admin UI, no versioned config, nothing analogous to GoRules here.

Practical implication: if backend changes a threshold, mobile's hardcoded snapshot goes stale silently, with no version marker to detect it. **Recommend:** backend pings mobile on any change to `GA_GATED_STAGES` or `UNCONDITIONAL_STAGES_BY_FORM` as a manual coordination step until/unless a structured-export mechanism (item 3) gets built — there's no automated way to catch drift today.
