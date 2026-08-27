import { badGateway } from '@armman/service-commons';

// Read directly (not via appConfig) — see beneficiary.client.ts in this
// service for why.
const API_GATEWAY_BASE_URL = process.env.API_GATEWAY_BASE_URL ?? 'http://localhost:3000';

/**
 * Confirms a media asset id actually exists and is viewable by the calling
 * SAKHI, via media-service's `GET /media/:id` (which already enforces
 * beneficiary-roster ownership scoping — reused here rather than building
 * a parallel existence check with its own authorization logic). A 403 (not
 * this caller's own asset) and a 404 (doesn't exist) are both treated as
 * "not usable for this follow-up" — the caller-facing distinction doesn't
 * matter to ReferralFollowupService, which just needs to know whether to
 * accept or reject the submitted id.
 */
export async function mediaAssetExists(
  mediaAssetId: string,
  authorizationHeader: string,
): Promise<boolean> {
  let res: Response;
  try {
    res = await fetch(`${API_GATEWAY_BASE_URL}/api/v1/media/${mediaAssetId}`, {
      headers: { Authorization: authorizationHeader },
    });
  } catch {
    throw badGateway('Unable to verify media asset — media-service is unreachable.');
  }

  if (res.status === 404 || res.status === 403) return false;
  if (!res.ok) {
    throw badGateway('Unable to verify media asset — media-service returned an error.');
  }
  return true;
}
