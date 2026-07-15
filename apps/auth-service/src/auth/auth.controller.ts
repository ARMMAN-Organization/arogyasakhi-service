import { Router } from 'express';
import type { AuthService } from './auth.service';
import { loginSchema } from './dto/login.dto';
import { refreshSchema } from './dto/refresh.dto';
import { createUserSchema } from './dto/create-user.dto';
import {
  asyncHandler,
  authenticate,
  ok,
  requireRoles,
  unauthorized,
  validateBody,
} from '../app.module';
import type { TokenSigner } from '@armman/service-commons';

/** Auth HTTP routes. Mounted under the global `api/v1` prefix. */
export function createAuthRouter(service: AuthService, signer: TokenSigner): Router {
  const router = Router();

  router.post(
    '/auth/login',
    validateBody(loginSchema),
    asyncHandler(async (req, res) => {
      const tokens = await service.login(req.body, req.ip ?? null);
      res.status(200).json(ok(tokens));
    }),
  );

  router.post(
    '/auth/refresh',
    validateBody(refreshSchema),
    asyncHandler(async (req, res) => {
      const tokens = await service.refresh(req.body.refreshToken, req.ip ?? null);
      res.status(200).json(ok(tokens));
    }),
  );

  router.post(
    '/auth/logout',
    authenticate(signer),
    validateBody(refreshSchema),
    asyncHandler(async (req, res) => {
      await service.logout(req.body.refreshToken);
      res.status(200).json(ok({ loggedOut: true }));
    }),
  );

  router.post(
    '/users',
    authenticate(signer),
    requireRoles('ADMIN', 'SUPERVISOR'),
    validateBody(createUserSchema),
    asyncHandler(async (req, res, next) => {
      // authenticate(signer) runs first and calls next(unauthorized()) if it
      // fails, so req.user is always populated by the time this handler runs.
      if (!req.user) return next(unauthorized());
      const user = await service.createUser(req.body, req.user.roles);
      res.status(201).json(ok(user));
    }),
  );

  router.get(
    '/me',
    authenticate(signer),
    asyncHandler(async (req, res, next) => {
      // authenticate(signer) runs first and calls next(unauthorized()) if it
      // fails, so req.user is always populated by the time this handler runs.
      if (!req.user) return next(unauthorized());
      const profile = await service.getProfile(req.user.id);
      if (!profile) return next(unauthorized());
      res.json(ok(profile));
    }),
  );

  return router;
}
