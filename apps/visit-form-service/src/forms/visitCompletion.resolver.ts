import type { VisitInstanceRepository } from '../visits/visitInstance.repository';
import { resolveVisitStatusCodes } from '../lookups/lookup.client';

/**
 * The visit-linked form codes that actually represent a clinical visit
 * being conducted — same set as vitalsExtractor.ts's
 * FORM_CODE_TO_VITALS_MAPPING (the vitals-bearing visit forms), reused here
 * rather than re-derived: a submission against one of these forms IS the
 * visit being conducted, so its success is also the visit's completion
 * signal. *_CLOSURE_VISIT and one-time forms like MOTHER_REGISTRATION are
 * deliberately excluded — those don't represent a scheduled visit being
 * completed.
 */
const VISIT_COMPLETING_FORM_CODES = new Set([
  'ANC_VISIT',
  'POSTPARTUM_VISIT',
  'NEONATAL_VISIT',
  'INC_VISIT',
  'CCV_VISIT',
]);

/**
 * Marks a visit-linked submission's VisitInstance COMPLETED, best-effort —
 * same tolerance as every other post-submission side effect in
 * form.service.ts's createSubmission (phase-advance, risk-trigger,
 * ccvOpeningRiskState): a failure here must never fail the submission
 * itself, since the submission (and its form_answers) already committed
 * successfully before this runs.
 *
 * Without this, a visit only reaches VISIT_STATUS COMPLETED via a second,
 * separate `PATCH /visits/:id` call the client has to remember to make —
 * this closes that gap so "the visit's form was submitted" and "the visit
 * is COMPLETED" can't drift apart. Silently a no-op if the visit is already
 * COMPLETED (e.g. the client also called PATCH itself, or this is an
 * idempotent submission replay) — this is a side effect, not a direct API
 * call, so there's no caller waiting on a 409 the way PATCH /visits/:id's
 * own conflict check works.
 */
export async function resolveVisitCompletion(
  formCode: string,
  visitId: string | null | undefined,
  changedByUserId: string,
  visitInstanceRepository: VisitInstanceRepository,
  authorizationHeader: string,
): Promise<void> {
  if (!visitId || !VISIT_COMPLETING_FORM_CODES.has(formCode)) return;

  try {
    const existing = await visitInstanceRepository.findById(visitId);
    if (!existing || existing.completedAt) return;

    const statusCodes = await resolveVisitStatusCodes(authorizationHeader);
    const completedStatusId = [...statusCodes.entries()].find(
      ([, code]) => code === 'COMPLETED',
    )?.[0];
    if (!completedStatusId) {
      console.warn(
        'VISIT_STATUS lookup category has no COMPLETED value — skipping visit completion ' +
          `for visit ${visitId}.`,
      );
      return;
    }

    await visitInstanceRepository.updateStatus(
      visitId,
      existing.statusLookupValueId,
      {
        statusLookupValueId: completedStatusId,
        actualVisitDate: existing.actualVisitDate ?? new Date(),
        meetBeneficiaryFlag: existing.meetBeneficiaryFlag ?? true,
        notMetReason: existing.notMetReason ?? undefined,
        completedAt: new Date(),
      },
      changedByUserId,
    );
  } catch (err) {
    console.warn(
      `Failed to auto-complete visit ${visitId} on form submission. ` +
        `${err instanceof Error ? err.message : String(err)}`,
    );
  }
}
