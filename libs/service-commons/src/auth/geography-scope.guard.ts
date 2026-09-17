import type { RequestHandler } from 'express';
import { forbidden, unauthorized } from '../http/http-error';
import './authenticate'; // registers the `req.user` type augmentation

/** One geography unit in an ancestor chain, as returned by auth-service's
 * `GET /geography-units/:id/ancestors` (see visit-form-service's/
 * beneficiary-service's own geography.client.ts). Only the id is needed here. */
export interface GeographyAncestor {
  geographyUnitId: string;
}

/**
 * Resolves a geography unit's ancestor chain (from that unit itself up to
 * STATE) given its id and an Authorization header. This middleware calls it
 * with the TARGET resource's geography unit id, not the caller's — see
 * requireGeographyScope's own doc comment for why. Each service already has
 * its own copy of this call (no cross-service imports, per the forklift
 * rule) — this middleware takes it as a parameter instead of importing a
 * concrete client, so `service-commons` stays dependency-free of any one
 * service's HTTP client.
 */
export type ResolveAncestorChain = (
  geographyUnitId: string,
  authorizationHeader: string,
) => Promise<GeographyAncestor[]>;

/**
 * Enforces that the caller's own assigned geography unit is the target
 * resource's geography unit, or an ancestor of it (e.g. a Supervisor
 * assigned at BLOCK level may touch a VILLAGE/PADA beneath that block).
 * MANAGER/ADMIN are unrestricted, matching every other geography-scoped
 * check in this codebase (see beneficiary.service.ts's isPrivileged).
 *
 * `resolveTargetGeographyId` returns the target resource's own geography
 * unit id, or `null` if the route has no single target to scope (in which
 * case the caller passes through unchecked — the route has nothing to scope
 * against).
 *
 * A caller with no `geographyUnitId` of their own (rare — SAKHI/SUPERVISOR
 * accounts are expected to always carry one) is DENIED, not waved through.
 * This is a deliberate fail-closed choice for a real authorization gate —
 * distinct from the enrichment-only ad hoc geography lookups elsewhere in
 * this codebase (e.g. form.service.ts's getActiveVersion), which treat a
 * null geographyUnitId as "nothing to enrich" and return plain data rather
 * than gating access. A caller with no assigned geography has no basis to
 * be granted a scoped resource, so the safe default here is deny.
 */
export function requireGeographyScope(
  resolveAncestorChain: ResolveAncestorChain,
  resolveTargetGeographyId: (req: Parameters<RequestHandler>[0]) => string | null | undefined,
): RequestHandler {
  return (req, _res, next) => {
    const user = req.user;
    if (!user) return next(unauthorized());
    if (user.roles.includes('MANAGER') || user.roles.includes('ADMIN')) return next();

    const targetGeographyId = resolveTargetGeographyId(req);
    if (targetGeographyId === null || targetGeographyId === undefined) return next();

    if (!user.geographyUnitId) {
      return next(forbidden('Your account has no assigned geography — access denied.'));
    }
    if (user.geographyUnitId === targetGeographyId) return next();

    const authorizationHeader = req.header('authorization') ?? '';
    // Resolves the TARGET's ancestor chain (target unit up to STATE) and
    // checks whether the caller's own unit appears in it — i.e. the caller
    // is the target unit itself or one of its ancestors. Resolving the
    // caller's own chain instead would answer the wrong question (whether
    // the target is above the caller, not below it).
    resolveAncestorChain(targetGeographyId, authorizationHeader)
      .then((chain) => {
        const inScope = chain.some((unit) => unit.geographyUnitId === user.geographyUnitId);
        if (!inScope) {
          return next(forbidden('This resource is outside your assigned geography.'));
        }
        next();
      })
      .catch(next);
  };
}
