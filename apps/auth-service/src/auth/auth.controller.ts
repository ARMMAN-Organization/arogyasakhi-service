import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { AuthService } from './auth.service';
import { loginSchema } from './dto/login.dto';
import { refreshSchema } from './dto/refresh.dto';
import { createUserSchema } from './dto/create-user.dto';
import {
  asyncHandler,
  authenticate,
  createDocumentedRouter,
  ok,
  requireRoles,
  unauthorized,
  validateBody,
} from '../app.module';
import type { TokenSigner } from '@armman/service-commons';

extendZodWithOpenApi(z);

// Request DTOs annotated with examples for Swagger UI; validation behavior is
// unchanged (`.openapi()` only attaches documentation metadata).
const loginRequestSchema = loginSchema.extend({
  username: loginSchema.shape.username.openapi({ example: 'jane.sakhi' }),
  password: loginSchema.shape.password.openapi({ example: 'Str0ngPass!23' }),
});

const createUserRequestSchema = createUserSchema.extend({
  username: createUserSchema.shape.username.openapi({ example: 'jane.sakhi' }),
  mobileNumber: createUserSchema.shape.mobileNumber.openapi({ example: '+919876543210' }),
  password: createUserSchema.shape.password.openapi({ example: 'Str0ngPass!23' }),
  displayName: createUserSchema.shape.displayName.openapi({ example: 'Jane Sakhi' }),
  email: createUserSchema.shape.email.openapi({ example: 'jane.sakhi@example.org' }),
  roleCode: createUserSchema.shape.roleCode.openapi({ example: 'SAKHI' }),
});

const authTokensSchema = z.object({
  accessToken: z.string().openapi({ description: 'Short-lived JWT access token (RS256).' }),
  refreshToken: z
    .string()
    .openapi({ description: 'Opaque refresh token; single-use, rotated on refresh.' }),
  expiresIn: z.number().openapi({ description: 'Access token lifetime in seconds.', example: 900 }),
});

const userProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string().openapi({ example: 'jane.sakhi' }),
  displayName: z.string().openapi({ example: 'Jane Sakhi' }),
  mobileNumber: z.string().openapi({ example: '+919876543210' }),
  email: z.string().email().nullable().openapi({ example: 'jane.sakhi@example.org' }),
  status: z.string().openapi({ example: 'ACTIVE' }),
  createdAt: z.string().datetime(),
  roles: z.array(
    z.object({
      roleCode: z.string().openapi({ example: 'SAKHI' }),
      projectId: z.string().uuid().nullable(),
      geographyUnitId: z.string().uuid().nullable(),
    }),
  ),
  projectName: z
    .string()
    .nullable()
    .openapi({ description: "The primary role's project name.", example: 'GEP-2324' }),
  cardNumber: z.string().nullable().openapi({
    description: 'Sakhi employee/ID card number — null for non-SAKHI roles.',
    example: 'EMP-00123',
  }),
  maskedBankAccount: z.string().nullable().openapi({
    description: 'Last 4 digits of the linked bank account, masked — never the full number.',
    example: '••••1234',
  }),
});

const createdUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().openapi({ example: 'jane.sakhi' }),
  mobileNumber: z.string().openapi({ example: '+919876543210' }),
  displayName: z.string().openapi({ example: 'Jane Sakhi' }),
  email: z.string().nullable(),
  status: z.string().openapi({ example: 'ACTIVE' }),
  createdAt: z.string().datetime(),
});

const apiErrorSchema = z.object({
  success: z.literal(false),
  message: z.string(),
  errorCode: z.string().openapi({ example: 'VALIDATION_ERROR' }),
  details: z.record(z.unknown()).optional(),
});

function envelope<T extends z.ZodTypeAny>(data: T) {
  return z.object({ success: z.literal(true), message: z.string(), data });
}

/**
 * Auth HTTP routes. Mounted under the global `api/v1` prefix.
 *
 * Uses `createDocumentedRouter()` so each route's OpenAPI entry is defined
 * in the same call as the Express route itself — the request body schema
 * and auth requirement are inferred from `validateBody`/`authenticate`
 * already in the middleware chain, so `/docs.json` can never drift from
 * what's actually mounted.
 */
export function createAuthRouter(service: AuthService, signer: TokenSigner) {
  const doc = createDocumentedRouter();

  doc.post(
    '/auth/login',
    {
      summary: 'Log in with username and password',
      tags: ['Auth'],
      responses: {
        200: { description: 'Authenticated', schema: envelope(authTokensSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Invalid credentials', schema: apiErrorSchema },
      },
    },
    validateBody(loginRequestSchema),
    asyncHandler(async (req, res) => {
      const tokens = await service.login(req.body, req.ip ?? null);
      res.status(200).json(ok(tokens));
    }),
  );

  doc.post(
    '/auth/refresh',
    {
      summary: 'Exchange a refresh token for a new token pair',
      tags: ['Auth'],
      responses: {
        200: { description: 'New tokens issued', schema: envelope(authTokensSchema) },
        401: { description: 'Invalid or expired refresh token', schema: apiErrorSchema },
      },
    },
    validateBody(refreshSchema),
    asyncHandler(async (req, res) => {
      const tokens = await service.refresh(req.body.refreshToken, req.ip ?? null);
      res.status(200).json(ok(tokens));
    }),
  );

  doc.post(
    '/auth/logout',
    {
      summary: 'Revoke a refresh token',
      tags: ['Auth'],
      responses: {
        200: {
          description: 'Logged out',
          schema: envelope(z.object({ loggedOut: z.literal(true) })),
        },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
    authenticate(signer),
    validateBody(refreshSchema),
    asyncHandler(async (req, res) => {
      await service.logout(req.body.refreshToken);
      res.status(200).json(ok({ loggedOut: true }));
    }),
  );

  doc.post(
    '/users',
    {
      summary: 'Create a user (ADMIN creates any role; SUPERVISOR creates SAKHI only)',
      tags: ['Users'],
      responses: {
        201: { description: 'User created', schema: envelope(createdUserSchema) },
        400: { description: 'Validation error', schema: apiErrorSchema },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
        403: { description: 'Caller not permitted to create this role', schema: apiErrorSchema },
        409: { description: 'Username or mobile number already in use', schema: apiErrorSchema },
      },
    },
    authenticate(signer),
    requireRoles('ADMIN', 'SUPERVISOR'),
    validateBody(createUserRequestSchema),
    asyncHandler(async (req, res, next) => {
      // authenticate(signer) runs first and calls next(unauthorized()) if it
      // fails, so req.user is always populated by the time this handler runs.
      if (!req.user) return next(unauthorized());
      const user = await service.createUser(req.body, req.user.roles);
      res.status(201).json(ok(user));
    }),
  );

  doc.get(
    '/me',
    {
      summary: "Get the authenticated caller's profile",
      tags: ['Users'],
      responses: {
        200: { description: 'Caller profile', schema: envelope(userProfileSchema) },
        401: { description: 'Unauthenticated', schema: apiErrorSchema },
      },
    },
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

  return doc;
}
