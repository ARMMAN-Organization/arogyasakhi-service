import type { RequestHandler } from 'express';
import { forbidden, unauthorized } from '../http/http-error';
import './authenticate'; // registers the `req.user` type augmentation

/**
 * Enforces role-based access at the server edge. Requires `authenticate(...)`
 * to run first on the route so `req.user` is populated — this middleware only
 * checks roles, it never verifies the token itself. Authorization is NEVER left
 * to the client. Apply as per-route middleware, e.g.
 * `router.post('/x', authenticate(signer), requireRoles('ADMIN'), handler)`.
 */
export function requireRoles(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (roles.length === 0) return next();
    const user = req.user;
    if (!user) return next(unauthorized());
    const allowed = user.roles.some((role) => roles.includes(role));
    if (!allowed) return next(forbidden());
    next();
  };
}
