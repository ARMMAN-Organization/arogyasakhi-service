import { extendZodWithOpenApi } from '@asteasolutions/zod-to-openapi';
import { z } from 'zod';
import { buildOpenApiDocument, OpenAPIRegistry, registerRoute } from '@armman/service-commons';
import { loginSchema } from '../auth/dto/login.dto';
import { refreshSchema } from '../auth/dto/refresh.dto';
import { createUserSchema } from '../auth/dto/create-user.dto';
import { appConfig } from '../config/app-config';

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
  roles: z.array(
    z.object({
      roleCode: z.string().openapi({ example: 'SAKHI' }),
      projectId: z.string().uuid().nullable(),
      geographyUnitId: z.string().uuid().nullable(),
    }),
  ),
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

/** Builds the auth-service OpenAPI document from its existing Zod DTOs. */
export function buildAuthServiceOpenApiDocument() {
  const registry = new OpenAPIRegistry();

  registerRoute(registry, {
    method: 'post',
    path: '/api/v1/auth/login',
    summary: 'Log in with username and password',
    tags: ['Auth'],
    request: { body: loginRequestSchema },
    responses: {
      200: { description: 'Authenticated', schema: envelope(authTokensSchema) },
      400: { description: 'Validation error', schema: apiErrorSchema },
      401: { description: 'Invalid credentials', schema: apiErrorSchema },
    },
  });

  registerRoute(registry, {
    method: 'post',
    path: '/api/v1/auth/refresh',
    summary: 'Exchange a refresh token for a new token pair',
    tags: ['Auth'],
    request: { body: refreshSchema },
    responses: {
      200: { description: 'New tokens issued', schema: envelope(authTokensSchema) },
      401: { description: 'Invalid or expired refresh token', schema: apiErrorSchema },
    },
  });

  registerRoute(registry, {
    method: 'post',
    path: '/api/v1/auth/logout',
    summary: 'Revoke a refresh token',
    tags: ['Auth'],
    requiresAuth: true,
    request: { body: refreshSchema },
    responses: {
      200: {
        description: 'Logged out',
        schema: envelope(z.object({ loggedOut: z.literal(true) })),
      },
      401: { description: 'Unauthenticated', schema: apiErrorSchema },
    },
  });

  registerRoute(registry, {
    method: 'post',
    path: '/api/v1/users',
    summary: 'Create a user (ADMIN creates any role; SUPERVISOR creates SAKHI only)',
    tags: ['Users'],
    requiresAuth: true,
    request: { body: createUserRequestSchema },
    responses: {
      201: { description: 'User created', schema: envelope(createdUserSchema) },
      400: { description: 'Validation error', schema: apiErrorSchema },
      401: { description: 'Unauthenticated', schema: apiErrorSchema },
      403: { description: 'Caller not permitted to create this role', schema: apiErrorSchema },
      409: { description: 'Username or mobile number already in use', schema: apiErrorSchema },
    },
  });

  registerRoute(registry, {
    method: 'get',
    path: '/api/v1/me',
    summary: "Get the authenticated caller's profile",
    tags: ['Users'],
    requiresAuth: true,
    responses: {
      200: { description: 'Caller profile', schema: envelope(userProfileSchema) },
      401: { description: 'Unauthenticated', schema: apiErrorSchema },
    },
  });

  const servers =
    appConfig.PUBLIC_BASE_URLS.length > 0
      ? appConfig.PUBLIC_BASE_URLS.map((url) => ({ url }))
      : [{ url: `http://localhost:${appConfig.PORT}`, description: 'Local' }];

  return buildOpenApiDocument(
    registry,
    {
      title: 'Arogya Sakhi — Auth Service API',
      version: '1.0.0',
      description: 'Authentication, JWT/refresh tokens, sessions, and user management.',
    },
    servers,
  );
}
