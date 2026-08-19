import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import type { TokenSigner } from '@armman/service-commons';
import type { AuthService } from './auth.service';
import { createAuthController } from './auth.controller';
import { loginSchema } from './dto/login.dto';
import { refreshSchema } from './dto/refresh.dto';
import { createUserSchema } from './dto/create-user.dto';
import { updateUserSchema } from './dto/update-user.dto';
import {
  authenticate,
  errorResponse,
  requireRoles,
  validate,
  validateBody,
  type DocumentedRouter,
} from '../app.module';

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
  accessToken: z.string().openapi({
    description:
      'JWT access token (RS256). Non-expiring (no exp claim) for every role except ADMIN, ' +
      'which gets a short-lived expiry (JWT_ADMIN_ACCESS_TOKEN_TTL).',
  }),
  refreshToken: z
    .string()
    .openapi({ description: 'Opaque refresh token; single-use, rotated on refresh.' }),
  expiresIn: z
    .number()
    .nullable()
    .openapi({
      description:
        'Access token lifetime in seconds, or null if it never expires. Null for every role ' +
        'except ADMIN — only /auth/logout or revocation ends a non-expiring session.',
      examples: [null, 900],
    }),
  roles: z
    .array(z.string())
    .openapi({ description: 'Every role code the caller holds.', example: ['SAKHI'] }),
  projectId: z.string().uuid().nullable().openapi({
    description: "The primary role assignment's project scope.",
  }),
  geographyUnitId: z.string().uuid().nullable().openapi({
    description: "The primary role assignment's geography scope.",
  }),
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
  supervisorId: z.string().uuid().nullable().openapi({
    description: "Sakhi profile's supervisor — null for non-SAKHI roles.",
  }),
});

// Narrower than userProfileSchema — a name only, no contact/PII/role fields.
// Returned by GET /users/:id/name, a service-to-service lookup (e.g.
// media-service resolving an `uploadedByUserId`), not a general profile read.
const userNameSchema = z.object({
  id: z.string().uuid(),
  displayName: z.string().openapi({ example: 'Jane Sakhi' }),
});

const userIdParamsSchema = z
  .object({ id: z.string().uuid().openapi({ example: 'cc85addf-5214-45e3-b207-c2a3dadcc52f' }) })
  .strict();

const createdUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string().openapi({ example: 'jane.sakhi' }),
  mobileNumber: z.string().openapi({ example: '+919876543210' }),
  displayName: z.string().openapi({ example: 'Jane Sakhi' }),
  email: z.string().nullable(),
  status: z.string().openapi({ example: 'ACTIVE' }),
  createdAt: z.string().datetime(),
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
export function registerAuthRoutes(
  doc: DocumentedRouter,
  service: AuthService,
  signer: TokenSigner,
) {
  const controller = createAuthController(service);

  doc.post(
    '/auth/login',
    {
      summary: 'Log in with username and password',
      tags: ['Auth'],
      responses: {
        200: { description: 'Authenticated', schema: envelope(authTokensSchema) },
        400: errorResponse(400, { message: 'password: Required' }),
        401: errorResponse(401, {
          message: 'Invalid credentials.',
          description: 'Unauthenticated — username/password did not match',
        }),
        500: errorResponse(500),
      },
    },
    validateBody(loginRequestSchema),
    controller.login,
  );

  doc.post(
    '/auth/refresh',
    {
      summary: 'Exchange a refresh token for a new token pair',
      tags: ['Auth'],
      responses: {
        200: { description: 'New tokens issued', schema: envelope(authTokensSchema) },
        400: errorResponse(400, { message: 'refreshToken: Required' }),
        401: errorResponse(401, {
          message: 'Invalid or expired refresh token.',
          description: 'Unauthenticated — refresh token invalid, expired, or already used',
        }),
        500: errorResponse(500),
      },
    },
    validateBody(refreshSchema),
    controller.refresh,
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
        400: errorResponse(400, { message: 'refreshToken: Required' }),
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validateBody(refreshSchema),
    controller.logout,
  );

  doc.post(
    '/users',
    {
      summary: 'Create a user (ADMIN creates any role; SUPERVISOR creates SAKHI only)',
      tags: ['Users'],
      responses: {
        201: { description: 'User created', schema: envelope(createdUserSchema) },
        400: errorResponse(400, { message: 'password: Required' }),
        401: errorResponse(401),
        403: errorResponse(403, {
          message: 'You do not have access to this resource.',
          description: 'Forbidden — caller not permitted to create this role',
        }),
        409: errorResponse(409, {
          message: 'Username or mobile number already in use.',
          description: 'Conflict — username or mobile number already in use',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN', 'SUPERVISOR'),
    validateBody(createUserRequestSchema),
    controller.createUser,
  );

  doc.patch(
    '/users/:id',
    {
      summary:
        'Update a user — identity/contact/status/credentials (users), project/geography scope ' +
        'for an existing role (user_roles), and Sakhi profile fields (sakhi_profiles); ADMIN only',
      tags: ['Users'],
      params: userIdParamsSchema,
      responses: {
        200: { description: 'User updated', schema: envelope(userProfileSchema) },
        400: errorResponse(400, { message: 'At least one field must be provided.' }),
        401: errorResponse(401),
        403: errorResponse(403),
        404: errorResponse(404, { message: 'User not found.' }),
        409: errorResponse(409, {
          message:
            'A user with this username, mobile number, email, or employee code already exists.',
        }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('ADMIN'),
    validate(userIdParamsSchema, 'params'),
    validateBody(updateUserSchema),
    controller.updateUser,
  );

  doc.patch(
    '/users/:id/reactivate',
    {
      summary:
        "Reactivate a deactivated user's account (Quick Response DATA_RESTORE card, approved) — " +
        'a narrow status-only operation, unlike the general PATCH /users/:id',
      tags: ['Users'],
      params: userIdParamsSchema,
      responses: {
        200: { description: 'User reactivated', schema: envelope(userProfileSchema) },
        401: errorResponse(401),
        403: errorResponse(403, {
          message: 'Only Sakhi accounts can be reactivated via this endpoint.',
        }),
        404: errorResponse(404, { message: 'User not found.' }),
        409: errorResponse(409, { message: 'This user is already ACTIVE.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    requireRoles('SUPERVISOR', 'MANAGER', 'ADMIN'),
    validate(userIdParamsSchema, 'params'),
    controller.reactivateUser,
  );

  doc.get(
    '/me',
    {
      summary: "Get the authenticated caller's profile",
      tags: ['Users'],
      responses: {
        200: { description: 'Caller profile', schema: envelope(userProfileSchema) },
        401: errorResponse(401),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    controller.getProfile,
  );

  doc.get(
    '/users/:id/name',
    {
      summary:
        "Resolve a user's display name by id — a narrow, low-sensitivity lookup for other " +
        "services to enrich a stored user id (e.g. media-service's uploadedByUserId) without a " +
        'cross-service DB join. Any authenticated role may call this — a display name alone ' +
        'carries no PII/contact/role information, unlike the full user profile.',
      tags: ['Users'],
      params: userIdParamsSchema,
      responses: {
        200: { description: "User's display name", schema: envelope(userNameSchema) },
        401: errorResponse(401),
        404: errorResponse(404, { message: 'User not found.' }),
        500: errorResponse(500),
      },
    },
    authenticate(signer),
    validate(userIdParamsSchema, 'params'),
    controller.getUserName,
  );
}
