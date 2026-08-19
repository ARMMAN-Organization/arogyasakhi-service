import { asyncHandler, ok, unauthorized } from '../app.module';
import type { AuthService } from './auth.service';

/**
 * Auth request handlers. Mounted under the global `api/v1` prefix by
 * `auth.routes.ts`.
 */
export function createAuthController(service: AuthService) {
  return {
    login: asyncHandler(async (req, res) => {
      const tokens = await service.login(req.body, req.ip ?? null);
      res.status(200).json(ok(tokens));
    }),

    refresh: asyncHandler(async (req, res) => {
      const tokens = await service.refresh(req.body.refreshToken, req.ip ?? null);
      res.status(200).json(ok(tokens));
    }),

    logout: asyncHandler(async (req, res) => {
      await service.logout(req.body.refreshToken);
      res.status(200).json(ok({ loggedOut: true }));
    }),

    createUser: asyncHandler(async (req, res, next) => {
      // authenticate(signer) runs first and calls next(unauthorized()) if it
      // fails, so req.user is always populated by the time this handler runs.
      if (!req.user) return next(unauthorized());
      const user = await service.createUser(req.body, req.user.roles);
      res.status(201).json(ok(user));
    }),

    updateUser: asyncHandler(async (req, res) => {
      res.json(ok(await service.updateUser(req.params.id, req.body)));
    }),

    reactivateUser: asyncHandler(async (req, res, next) => {
      // authenticate(signer) runs first and calls next(unauthorized()) if it
      // fails, so req.user is always populated by the time this handler runs.
      if (!req.user) return next(unauthorized());
      res.json(ok(await service.reactivateUser(req.params.id, req.user)));
    }),

    getProfile: asyncHandler(async (req, res, next) => {
      // authenticate(signer) runs first and calls next(unauthorized()) if it
      // fails, so req.user is always populated by the time this handler runs.
      if (!req.user) return next(unauthorized());
      const profile = await service.getProfile(req.user.id);
      if (!profile) return next(unauthorized());
      res.json(ok(profile));
    }),

    getUserName: asyncHandler(async (req, res) => {
      res.json(ok(await service.getDisplayName(req.params.id)));
    }),
  };
}
