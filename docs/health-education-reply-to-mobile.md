# Reply — Health Education Messages (CR-M3-06), items 1–3

All three confirmed as real gaps. Here's exact status, per item — code, not description, checked against the actual files.

---

## 1. Message body text missing from both paths

**Status: confirmed, not yet fixed — plan below, needs one decision from you first.**

You're right on both counts:

- `resolveMappedContent` (`beneficiaryRisk.service.ts:159-167`) fetches full `HealthEducationMessage` rows (which do carry `bodyEn`/`bodyMarathi`) and discards them before building `EducationContent` — only `topicCode`/`topicName`/`mediaType`/`contentUrl` survive.
- Same pattern in Path B: `toEducationContent()` in `healthEducationStage.resolver.ts:166-178` does the identical discard.
- Confirmed via the Zod schema too — `educationContentSchema` in `beneficiaryRisk.routes.ts:27-32` has no `bodyEn`/`bodyMarathi`/`id` fields, so this isn't just a mapping bug, the response contract itself never declared them.

**Plan (not yet implemented):**

- Add `id`, `bodyEn`, `bodyMarathi` to both `EducationContent` (risk-referral-service) and `StageEducationContent` (visit-form-service), and to their Zod schemas so `docs.json` reflects it.
- Update `beneficiaryRisk.service.spec.ts`'s existing COMING_SOON/mapped-content tests to assert the new fields, plus a new test asserting a real message returns non-null `bodyEn`.

**One thing I need from you before I implement:** for the COMING_SOON placeholder, should `bodyEn`/`bodyMarathi` come back as `"Content coming soon"` text, or should those two fields be `null` on the placeholder specifically (to distinguish "no real content" from "real content, just short")? I'd default to placeholder text (matches how the rest of this system already handles it) unless you'd rather have `null` be the explicit "nothing to show" signal on your side.

This is a same-day fix once that's confirmed — small, mechanical change across a few files.

---

## 2. `mediaFile` has no real URL, and it can't yet

**Status: confirmed as unimplemented — and confirmed WHY, which changes the fix. This is option (b), not (a). Not a same-day fix.**

I checked this platform's actual precedent for file uploads — there's a dedicated `media-service` (`apps/media-service`) with real S3-backed resolution:

```
apps/media-service/src/media/s3.client.ts
  getPresignedUploadUrl()  — client PUTs directly to S3 via a presigned URL
  getPresignedViewUrl()    — resolves a stored s3://bucket/key to a temporary signed GET URL
```

Every asset that resolves through this pipeline has a `MediaAsset` row created via an upload flow first.

**The health-education `mediaFile` values (`"anaemia"`, `"marathi_immunization.mp4"`, etc.) were never uploaded through this pipeline at all.** There's no `MediaAsset` row, no S3 key, no file sitting anywhere for these labels to resolve to. This isn't a missing mapping function — the actual image/video files themselves don't exist in our storage yet. Someone (content/ops) needs to upload them via this service first; only then does a URL-resolution scheme make sense.

So: **option (a) isn't available today** — there's nothing to map to. Implementing **option (b)**:

- Add `mediaResolvedUrl: string | null` to the same response schemas as item 1, always `null` for now.
- Comment in code explaining it's reserved for once the real files are uploaded via `media-service` and a `mediaFile` → `MediaAsset.id` mapping exists.
- Mobile should render the text-only fallback for all 32 messages today, including the one VIDEO-type row (Infant Care: Immunization) — there is no video file to serve yet, not even for that one.

**What would need to happen before this becomes real:** someone uploads the actual media assets (currently just the one video, but potentially more later) through `media-service`'s upload flow, and a mapping step (likely a one-time seed update) links each `HealthEducationMessage.mediaFile` label to the resulting `MediaAsset.id`. That's a separate piece of work — flagging it plainly rather than pretending option (b)'s `null` field is the finished state.

---

## 3. Path A / Path B precedence

**Status: confirmed no logic exists — implementing a documented default per your instructions, not a combined field.**

Checked `form.mapper.ts` and `form.service.ts` end-to-end: the form-submission response only ever assembles `stageEducationContent` (Path B). It has no reference to risk-triggered `educationContent` (Path A) anywhere — that's a separate service, fetched by a separate client call (`GET /beneficiaries/:beneficiaryId/risk`). A true combined/deduplicated field would require the form-submission flow to call risk-referral-service mid-request, which is a bigger, cross-service change than this item calls for.

Going with your stated fallback: a documented default, not a new field.

**Plan:**

- Add a code comment at the top of `healthEducationStage.resolver.ts` and near `toApiFormSubmission()` in `form.mapper.ts`, stating the rule explicitly:
  > Client precedence rule (pending product sign-off, not yet enforced server-side): when both Path A (`educationContent` from the risk endpoint) and Path B (`stageEducationContent` from this submission response) return a message for the same visit, Path A takes priority — a detected clinical issue outranks general stage guidance. If the same `topicCode` appears in both, the client should drop the Path B duplicate and keep Path A's.
- No server-side dedup, no new field, no test changes (comment-only).

**Flagging clearly, as you asked:** this is a default for mobile to build against today, not a settled product decision — expect it may change once product weighs in.

---

## Summary table

| #   | Item                 | Status                                               | Same-day fix?                                       |
| --- | -------------------- | ---------------------------------------------------- | --------------------------------------------------- |
| 1   | Body text missing    | Confirmed bug, plan ready                            | Yes, pending 1 decision (COMING_SOON text vs. null) |
| 2   | Media URL resolution | Confirmed — files don't exist yet, not just unmapped | No — needs a real upload first (content/ops task)   |
| 3   | Path A/B precedence  | Confirmed no logic exists                            | Yes — documented default, no code behavior change   |

Let me know on item 1's open question and I'll implement items 1 and 3 today. Item 2's `mediaResolvedUrl: null` field ships same day; the real resolution is blocked on someone uploading the actual media files.
