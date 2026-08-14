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
}

/** Raw shape of `GET /beneficiaries/:id`'s response — geography lives under `pii`. */
interface BeneficiaryCaseDetailResponse {
  id: string;
  sakhiId: string;
  projectId: string;
  beneficiaryTypeLookupId: string;
  caseTypeLookupId: string;
  pii: {
    villageId: string;
    padaId: string;
    healthSubCentreId: string;
    phcId: string;
    stateId: string;
    districtId: string;
  };
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
  const { pii, ...rest } = body.data;
  return {
    ...rest,
    villageId: pii.villageId,
    padaId: pii.padaId,
    healthSubCentreId: pii.healthSubCentreId,
    phcId: pii.phcId,
    stateId: pii.stateId,
    districtId: pii.districtId,
  };
}
