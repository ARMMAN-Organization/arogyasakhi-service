import type { Request, RequestHandler } from 'express';
import { forbidden, unauthorized } from '../http/http-error';

interface AuthenticatedUser {
  id: string;
  roles: string[];
}

/**
 * Enforces role-based access at the server edge. Assumes an upstream auth guard
 * has populated `req.user`. Authorization is NEVER left to the client. Apply as
 * per-route middleware, e.g. `router.post('/x', requireRoles('admin'), handler)`.
 */
export function requireRoles(...roles: string[]): RequestHandler {
  return (req, _res, next) => {
    if (roles.length === 0) return next();
    const user = (req as Request & { user?: AuthenticatedUser }).user;
    if (!user) return next(unauthorized());
    const allowed = user.roles.some((role) => roles.includes(role));
    if (!allowed) return next(forbidden());
    next();
  };
}
