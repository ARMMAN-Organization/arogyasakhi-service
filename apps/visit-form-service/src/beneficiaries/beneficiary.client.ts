import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) so importing this client doesn't pull in
// app-config's full schema — mirrors geography.client.ts. Despite the name,
// this is the gateway's own base URL (see that file's comment) — every
// cross-service call in this service goes through the gateway so it can
// verify the forwarded Authorization header, never straight to another
// service's port.
const GATEWAY_BASE_URL = process.env.AUTH_SERVICE_BASE_URL ?? 'http://localhost:3000';

export interface BeneficiaryCase {
  id: string;
  sakhiId: string;
  projectId: string;
  beneficiaryTypeLookupId: string;
  caseTypeLookupId: string;
  /** Geography — mirrors piiSchema's required fields in beneficiary-service's
   * createBeneficiarySchema. Used by create-child.client.ts so a newborn's
   * case can be created without asking the Sakhi to re-enter geography
   * already captured for the mother — the child is, by definition, at the
   * same village/pada/PHC/sub-centre as the mother at delivery time. */
  villageId: string;
  padaId: string;
  healthSubCentreId: string;
  phcId: string;
  stateId: string;
  districtId: string;
  /** childCaseDetails.dateOfBirth — null for a MOTHER case, or a CHILD case
   * whose childCaseDetails row hasn't been created yet. Used by
   * ccvOpeningRiskState.resolver.ts's BR-13 computation (dob is the input
   * ccv.rulesJson.ts's decision graph keys its transition/program-exit
   * dates off). */
  childDateOfBirth: string | null;
  /** BeneficiaryCase.currentPhase — used by form.service.ts to detect the
   * actual INC->CCV transition moment (read BEFORE calling
   * updateBeneficiaryPhase) so BR-13's ccvOpeningRiskState computation runs
   * exactly once, not on every subsequent CCV_VISIT submission. */
  currentPhase: string;
}

/** Raw shape of `GET /beneficiaries/:id`'s response — geography lives under `pii`. */
interface BeneficiaryCaseDetailResponse {
  id: string;
  sakhiId: string;
  projectId: string;
  beneficiaryTypeLookupId: string;
  caseTypeLookupId: string;
  currentPhase: string;
  pii: {
    villageId: string;
    padaId: string;
    healthSubCentreId: string;
    phcId: string;
    stateId: string;
    districtId: string;
  };
  childCaseDetails: { dateOfBirth: string } | null;
}

/**
 * Fetches a beneficiary case via beneficiary-service's `GET /beneficiaries/:id`,
 * called through the gateway with the original caller's own bearer token
 * forwarded unchanged. `sakhiId` is what lets the caller
 * (visitSchedule.service.ts) enforce real ownership — a SAKHI may only
 * upload a schedule for her own beneficiaries, a SUPERVISOR only for
 * beneficiaries whose Sakhi is assigned to them. `projectId`/
 * `beneficiaryTypeLookupId`/`caseTypeLookupId`/geography are used by
 * create-child.client.ts (DELIVERY_VISIT's auto child-profile creation) so
 * the new child case inherits the same project/lookup/geography context as
 * its mother's case, rather than this service guessing or re-resolving them.
 */
export async function findBeneficiaryById(
  beneficiaryId: string,
  authorizationHeader: string,
): Promise<BeneficiaryCase | null> {
  const url = `${GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: authorizationHeader } });
  } catch {
    throw badGateway('Unable to verify the beneficiary — beneficiary-service is unreachable.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw badGateway('Unable to verify the beneficiary — beneficiary-service returned an error.');
  }

  const body = (await res.json()) as { data: BeneficiaryCaseDetailResponse };
  const { pii, childCaseDetails, ...rest } = body.data;
  return {
    ...rest,
    villageId: pii.villageId,
    padaId: pii.padaId,
    healthSubCentreId: pii.healthSubCentreId,
    phcId: pii.phcId,
    stateId: pii.stateId,
    districtId: pii.districtId,
    childDateOfBirth: childCaseDetails?.dateOfBirth ?? null,
  };
}

export interface BeneficiaryOwnership {
  id: string;
  sakhiId: string;
  caseType: string;
}

/**
 * Fetches ONLY `{id, sakhiId, caseType}` via beneficiary-service's
 * `GET /beneficiaries/:id/ownership` — deliberately NOT `findBeneficiaryById`
 * (the full `GET /beneficiaries/:id`), whose own response enrichment
 * (lastVisitVitals) calls back into this service's latest-visit-vitals
 * endpoint. A caller doing only an ownership check (e.g.
 * form.service.ts's getLatestVisitVitals) that used findBeneficiaryById
 * instead would recreate that exact request cycle: getById ->
 * resolveLatestVisitVitals -> here -> findBeneficiaryById -> getById -> ...
 * forever. Use this function for any ownership-only check reachable from
 * that endpoint; findBeneficiaryById remains correct for every other caller
 * (create-child.client.ts, visitSchedule.service.ts) that needs the full
 * case detail and is never itself in that cycle.
 */
export async function findBeneficiaryOwnership(
  beneficiaryId: string,
  authorizationHeader: string,
): Promise<BeneficiaryOwnership | null> {
  const url = `${GATEWAY_BASE_URL}/api/v1/beneficiaries/${beneficiaryId}/ownership`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: authorizationHeader } });
  } catch {
    throw badGateway('Unable to verify the beneficiary — beneficiary-service is unreachable.');
  }

  if (res.status === 404) return null;
  if (!res.ok) {
    throw badGateway('Unable to verify the beneficiary — beneficiary-service returned an error.');
  }

  const body = (await res.json()) as { data: BeneficiaryOwnership };
  return body.data;
}
