import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import type { OpenAPIObject } from 'openapi3-ts';

export interface SwaggerRouterOptions {
  basePath?: string;
  /** Defaults to `false` in production, `true` otherwise. API docs are a
   * reconnaissance target, so they're off by default once deployed; pass
   * `true` explicitly if a given service needs them reachable in prod. */
  enabled?: boolean;
  /** Custom `<title>` for the Swagger UI page (defaults to the document's own title). */
  pageTitle?: string;
}

/**
 * Mounts the service's OpenAPI spec under `basePath`:
 *   GET {basePath}/docs        — interactive Swagger UI
 *   GET {basePath}/docs.json   — raw OpenAPI 3.0 document
 * Disabled by default in production (both routes 404) since an OpenAPI spec
 * documents every request/response shape and is not something to expose to
 * the public internet; enable explicitly per-service if ever needed.
 */
export function createSwaggerRouter(
  document: OpenAPIObject,
  options: SwaggerRouterOptions = {},
): Router {
  const { basePath = '', enabled = process.env.NODE_ENV !== 'production', pageTitle } = options;
  const router = Router();

  if (!enabled) {
    return router;
  }

  router.get(`${basePath}/docs.json`, (_req, res) => {
    res.json(document);
  });

  router.use(
    `${basePath}/docs`,
    swaggerUi.serve,
    swaggerUi.setup(document, { customSiteTitle: pageTitle ?? document.info.title }),
  );

  return router;
}
