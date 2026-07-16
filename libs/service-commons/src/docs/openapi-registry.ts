import { OpenAPIRegistry, OpenAPIGenerator } from '@asteasolutions/zod-to-openapi';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import type { OpenAPIObject } from 'openapi3-ts';

export { OpenAPIRegistry };

export interface RouteDoc {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete';
  path: string;
  summary: string;
  tags: string[];
  request?: {
    body?: ZodTypeAny;
    params?: AnyZodObject;
    query?: AnyZodObject;
  };
  /** Status code -> { description, schema }. Each caller supplies its own
   * schema per response (including error responses) — `buildOpenApiDocument`
   * only registers the shared `bearerAuth` security scheme, not a shared
   * error schema. */
  responses: Record<number, { description: string; schema?: ZodTypeAny }>;
  /** Set for routes behind `authenticate(...)` — adds the bearer security
   * requirement so Swagger UI shows the padlock and "Authorize" flow. */
  requiresAuth?: boolean;
}

/** Registers one route's request/response shapes for OpenAPI generation. */
export function registerRoute(registry: OpenAPIRegistry, doc: RouteDoc): void {
  registry.registerPath({
    method: doc.method,
    path: doc.path,
    summary: doc.summary,
    tags: doc.tags,
    ...(doc.requiresAuth ? { security: [{ bearerAuth: [] }] } : {}),
    ...(doc.request
      ? {
          request: {
            ...(doc.request.body
              ? { body: { content: { 'application/json': { schema: doc.request.body } } } }
              : {}),
            ...(doc.request.params ? { params: doc.request.params } : {}),
            ...(doc.request.query ? { query: doc.request.query } : {}),
          },
        }
      : {}),
    responses: Object.fromEntries(
      Object.entries(doc.responses).map(([status, { description, schema }]) => [
        status,
        {
          description,
          ...(schema ? { content: { 'application/json': { schema } } } : {}),
        },
      ]),
    ),
  });
}

/**
 * Builds the final OpenAPI 3.0 document for a service: registers the shared
 * bearer auth scheme, generates paths/schemas from everything registered on
 * `registry`, and fills in service-level metadata.
 */
export function buildOpenApiDocument(
  registry: OpenAPIRegistry,
  info: { title: string; version: string; description?: string },
  servers: { url: string; description?: string }[],
): OpenAPIObject {
  registry.registerComponent('securitySchemes', 'bearerAuth', {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
  });

  const generator = new OpenAPIGenerator(registry.definitions, '3.0.3');
  return generator.generateDocument({
    info,
    servers,
  });
}
