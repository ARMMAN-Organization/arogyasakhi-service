import type { RequestHandler } from 'express';
import {
  TRUSTED_GEOGRAPHY_UNIT_ID_HEADER,
  TRUSTED_PROJECT_ID_HEADER,
  TRUSTED_ROLES_HEADER,
  TRUSTED_USER_ID_HEADER,
} from './forward-trusted-identity';
import { unauthorized } from '../http/http-error';
import type { AuthMarker } from './authenticate';
import './authenticate'; // registers the `req.user` type augmentation

/**
 * Downstream-service middleware: populates `req.user` from the identity
 * headers the API Gateway set after verifying the JWT (see
 * `verifyAndForwardIdentity`). Services behind the gateway do NOT re-verify
 * the token themselves — they trust these headers because, in production,
 * the gateway is the only ingress that reaches them. `requireRoles(...)`
 * consumes `req.user` exactly the same way as with `authenticate(...)`.
 */
export const trustGatewayIdentity: RequestHandler & AuthMarker = Object.assign(
  (
    req: Parameters<RequestHandler>[0],
    _res: Parameters<RequestHandler>[1],
    next: Parameters<RequestHandler>[2],
  ) => {
    const userId = req.header(TRUSTED_USER_ID_HEADER);
    if (!userId) return next(unauthorized());

    const rolesHeader = req.header(TRUSTED_ROLES_HEADER) ?? '';
    const projectId = req.header(TRUSTED_PROJECT_ID_HEADER);
    const geographyUnitId = req.header(TRUSTED_GEOGRAPHY_UNIT_ID_HEADER);

    req.user = {
      id: userId,
      roles: rolesHeader ? rolesHeader.split(',') : [],
      projectId: projectId || null,
      geographyUnitId: geographyUnitId || null,
    };
    next();
  },
  { __requiresAuth: true as const },
);
