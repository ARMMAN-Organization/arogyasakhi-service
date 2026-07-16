import type { Request, RequestHandler } from 'express';
import type { TokenSigner } from './token-signer';
import { unauthorized } from '../http/http-error';

export interface AuthenticatedUser {
  id: string;
  roles: string[];
  projectId: string | null;
  geographyUnitId: string | null;
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthenticatedUser;
  }
}

/** Attached to auth-gating middleware so the OpenAPI doc router can
 * auto-detect `requiresAuth` instead of it being a separately-maintained flag. */
export interface AuthMarker {
  __requiresAuth: true;
}

/**
 * Verifies the `Authorization: Bearer <token>` access token and populates
 * `req.user`. Must run before `requireRoles(...)` on any protected route —
 * `requireRoles` only checks `req.user`, it never authenticates on its own.
 */
export function authenticate(signer: TokenSigner): RequestHandler & AuthMarker {
  const handler: RequestHandler & Partial<AuthMarker> = (req: Request, _res, next) => {
    const header = req.header('authorization');
    if (!header?.startsWith('Bearer ')) return next(unauthorized());

    const token = header.slice('Bearer '.length).trim();
    if (!token) return next(unauthorized());

    signer
      .verify(token)
      .then((payload) => {
        req.user = {
          id: String(payload.sub),
          roles: Array.isArray(payload.roles) ? (payload.roles as string[]) : [],
          projectId: typeof payload.projectId === 'string' ? payload.projectId : null,
          geographyUnitId:
            typeof payload.geographyUnitId === 'string' ? payload.geographyUnitId : null,
        };
        next();
      })
      .catch(() => next(unauthorized('Invalid or expired token.')));
  };
  handler.__requiresAuth = true;
  return handler as RequestHandler & AuthMarker;
}
