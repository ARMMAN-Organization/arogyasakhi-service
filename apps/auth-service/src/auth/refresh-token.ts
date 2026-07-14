import { randomBytes, createHash } from 'node:crypto';

/** Opaque refresh token: a random value, stored server-side only as its hash. */
export function generateRefreshToken(): string {
  return randomBytes(48).toString('base64url');
}

/** SHA-256 is sufficient here — the token itself is high-entropy random data,
 * unlike a user password, so a fast hash is fine and lets us look sessions up
 * by exact hash match instead of comparing against every stored hash. */
export function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
