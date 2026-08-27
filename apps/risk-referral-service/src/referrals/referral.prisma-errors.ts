/**
 * Narrows a caught Prisma error to a unique-constraint violation (P2002) on
 * a specific column — used by ReferralService.create() to detect the
 * visit_referral_once collision specifically, so a future unrelated unique
 * index on this table doesn't get misreported as a visit collision.
 *
 * Prisma's P2002 `meta.target` for Postgres reports the underlying
 * column name(s) the unique index covers (e.g. `["visit_id"]`), NOT the
 * index's own name (`visit_referral_once`) — verified against a live
 * collision on this service (2026-08-27); the constraint-name string never
 * actually appears in `meta.target` at runtime. Callers must pass the
 * column name, not the index name.
 */
export function isUniqueConstraintViolation(err: unknown, columnName: string): boolean {
  if (typeof err !== 'object' || err === null || !('code' in err)) return false;
  if ((err as { code: unknown }).code !== 'P2002') return false;
  const meta = (err as { meta?: unknown }).meta;
  if (typeof meta !== 'object' || meta === null || !('target' in meta)) return false;
  const target = (meta as { target?: unknown }).target;
  return Array.isArray(target) ? target.includes(columnName) : target === columnName;
}
