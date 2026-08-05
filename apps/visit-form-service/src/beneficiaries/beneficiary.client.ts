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
}

/**
 * Fetches a beneficiary case's id/sakhiId via beneficiary-service's
 * `GET /beneficiaries/:id`, called through the gateway with the original
 * caller's own bearer token forwarded unchanged. `sakhiId` is what lets the
 * caller (visitSchedule.service.ts) enforce real ownership — a SAKHI may
 * only upload a schedule for her own beneficiaries, a SUPERVISOR only for
 * beneficiaries whose Sakhi is assigned to them.
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

  const body = (await res.json()) as { data: BeneficiaryCase };
  return body.data;
}
