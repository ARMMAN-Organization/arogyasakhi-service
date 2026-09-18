import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Signs and verifies the gateway's trusted-identity headers with an
 * HMAC-SHA256 shared secret (`INTERNAL_HEADER_SECRET`), so a downstream
 * service can tell a genuine gateway-forwarded identity from a forged one —
 * closing the "bare header trust" gap noted in trust-gateway-identity.ts's
 * own comment ("services trust these headers ... because the gateway is the
 * only ingress that reaches them," with no cryptographic check backing that
 * assumption). Deliberately HMAC, not the RS256 keypair auth-service/
 * api-gateway already use for end-user tokens: api-gateway only ever holds
 * the PUBLIC key (see token-signer.ts's own doc comment — "distributing only
 * the public key means a compromised verify-only service can never forge a
 * token"), so it structurally cannot sign an RS256 JWT itself. A symmetric
 * secret shared between the gateway and each downstream service is the
 * correct primitive for this internal, gateway-to-service trust boundary.
 *
 * A timestamp is included and checked against a max age so a captured header
 * value can't be replayed indefinitely if it ever leaks (e.g. via logs).
 */

const MAX_SIGNATURE_AGE_MS = 30_000;

export interface InternalIdentityFields {
  userId: string;
  roles: string;
  projectId: string;
  geographyUnitId: string;
}

function canonicalPayload(fields: InternalIdentityFields, timestampMs: string): string {
  return [fields.userId, fields.roles, fields.projectId, fields.geographyUnitId, timestampMs].join(
    '|',
  );
}

/** Computes `<timestampMs>.<hex hmac>` for the given identity fields, signed with `secret`. */
export function signInternalIdentity(fields: InternalIdentityFields, secret: string): string {
  const timestampMs = String(Date.now());
  const mac = createHmac('sha256', secret)
    .update(canonicalPayload(fields, timestampMs))
    .digest('hex');
  return `${timestampMs}.${mac}`;
}

/**
 * Verifies a signature produced by {@link signInternalIdentity} against the
 * same identity fields, secret, and a max-age window. Returns false on any
 * malformed input, secret mismatch, or expiry — never throws, so callers can
 * treat "not verified" uniformly as "reject."
 */
export function verifyInternalIdentitySignature(
  signature: string | undefined,
  fields: InternalIdentityFields,
  secret: string,
): boolean {
  if (!signature) return false;
  const dotIndex = signature.indexOf('.');
  if (dotIndex === -1) return false;

  const timestampMs = signature.slice(0, dotIndex);
  const mac = signature.slice(dotIndex + 1);
  const timestamp = Number(timestampMs);
  if (!Number.isFinite(timestamp)) return false;
  if (Math.abs(Date.now() - timestamp) > MAX_SIGNATURE_AGE_MS) return false;

  const expectedMac = createHmac('sha256', secret)
    .update(canonicalPayload(fields, timestampMs))
    .digest('hex');

  // Both hex strings are always the same length (HMAC-SHA256 digest size),
  // so timingSafeEqual's own length check never throws here — but guard it
  // anyway in case a future digest algorithm change breaks that invariant.
  const macBuffer = Buffer.from(mac, 'hex');
  const expectedBuffer = Buffer.from(expectedMac, 'hex');
  if (macBuffer.length !== expectedBuffer.length) return false;
  return timingSafeEqual(macBuffer, expectedBuffer);
}
