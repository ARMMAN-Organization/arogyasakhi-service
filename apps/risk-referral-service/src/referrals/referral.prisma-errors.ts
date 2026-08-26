/**
 * Narrows a caught Prisma error to a unique-constraint violation (P2002) on
 * a specific named index — used by ReferralService.create() to detect the
 * visit_referral_once collision specifically, so a future unrelated unique
 * index on this table doesn't get misreported as a visit collision.
 */
export function isUniqueConstraintViolation(err: unknown, constraintName: string): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  if ((err as { code: unknown }).code !== 'P2002') return false;
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('target' in meta)) return false;
  const target = (meta as { target?: unknown }).target;
  return Array.isArray(target) ? target.includes(constraintName) : target === constraintName;
}
