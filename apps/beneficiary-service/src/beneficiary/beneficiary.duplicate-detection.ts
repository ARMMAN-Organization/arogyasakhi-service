import { conflict, hashForSearch, HttpError, normalizeForSearch } from '@armman/service-commons';
import type { DuplicateSearchTokens } from './beneficiary.repository';
import type { CreateBeneficiaryInput } from './dto/create-beneficiary.dto';

/**
 * The shape `findDuplicateCandidate` returns — the matched BeneficiaryCase
 * with just the fields FR-S-2.4/2.5 need off its current summary. Structural
 * (not the full Prisma type) so the decision logic isn't coupled to it.
 */
export interface DuplicateMatch {
  id: string;
  currentStatus: string;
  currentSummary: {
    dateOfDelivery: Date | null;
    closureDate: Date | null;
    lmpDate: Date | null;
  } | null;
}

/** Builds the non-reversible search tokens used for duplicate detection. */
export function buildSearchTokens(dto: CreateBeneficiaryInput): DuplicateSearchTokens {
  const geographyParts = [dto.pii.villageId, dto.pii.padaId].filter(Boolean).join('|');
  const dob = dto.case.caseType === 'CHILD' ? dto.childDetails?.dateOfBirth : dto.pii.dateOfBirth;

  return {
    nameToken: hashForSearch(normalizeForSearch(dto.pii.fullName)),
    caseTypeLookupId: dto.case.caseTypeLookupId,
    dobToken: dob ? hashForSearch(dob.toISOString().slice(0, 10)).toString('base64') : null,
    phoneHash: dto.pii.phone ? hashForSearch(normalizeForSearch(dto.pii.phone)) : null,
    geographyToken: geographyParts
      ? hashForSearch(normalizeForSearch(geographyParts)).toString('base64')
      : null,
    lmpDateToken: dto.motherDetails
      ? hashForSearch(dto.motherDetails.lmpDate.toISOString().slice(0, 10)).toString('base64')
      : null,
  };
}

/**
 * Decides how to handle a duplicate-detection match, per SRS FR-S-2.4/2.5.
 * Throws to block or prompt; returns normally to allow the enrollment.
 *
 * The matched case's `currentSummary` carries delivery/closure/status/LMP.
 *
 * - FR-S-2.5 (re-enrolment): matched case is JOURNEY_COMPLETE/CLOSED, has a
 *   confirmed delivery, and the new LMP differs from the matched case's LMP
 *   → surface the specific "is this a new pregnancy?" prompt (409 with a
 *   RE_ENROLLMENT reason in details) so the client can confirm and resubmit
 *   with acknowledgeDuplicate.
 * - FR-S-2.4 (new pregnancy): matched case has BOTH a delivery date AND a
 *   closure date → treat as a completed prior journey, allow the new
 *   enrollment (return normally).
 * - FR-S-2.4 (hard duplicate): anything else — including a matched case
 *   with no summary row at all (SRS-literal: "if both not present →
 *   duplicate, registration cannot proceed") → block with a 409.
 */
export function evaluateDuplicateMatch(match: DuplicateMatch, dto: CreateBeneficiaryInput): void {
  const summary = match.currentSummary;
  const hasDelivery = Boolean(summary?.dateOfDelivery);
  const hasClosure = Boolean(summary?.closureDate);
  const isCompletedJourney =
    match.currentStatus === 'JOURNEY_COMPLETE' || match.currentStatus === 'CLOSED';

  const newLmp = dto.motherDetails?.lmpDate;
  const priorLmp = summary?.lmpDate;
  const lmpDiffers =
    newLmp != null &&
    priorLmp != null &&
    newLmp.toISOString().slice(0, 10) !== priorLmp.toISOString().slice(0, 10);

  // FR-S-2.5 — re-enrolment for a new pregnancy after a completed journey.
  if (isCompletedJourney && hasDelivery && lmpDiffers) {
    throw new HttpError(
      409,
      'A previous record exists for this beneficiary. Is this a new pregnancy?',
      {
        reason: 'RE_ENROLLMENT',
        existingBeneficiaryId: match.id,
        resolution: 'Resubmit with acknowledgeDuplicate: true to enroll a new pregnancy.',
      },
    );
  }

  // FR-S-2.4 — both delivery AND closure exist → completed prior journey,
  // this is a legitimate new pregnancy; allow it through.
  if (hasDelivery && hasClosure) {
    return;
  }

  // FR-S-2.4 — otherwise a hard duplicate (including no summary row at all).
  throw conflict(
    `A possible duplicate beneficiary already exists (beneficiaryId: ${match.id}). ` +
      'Resubmit with acknowledgeDuplicate: true to proceed anyway.',
  );
}
