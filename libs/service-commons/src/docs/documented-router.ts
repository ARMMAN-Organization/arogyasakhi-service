import { Router, type RequestHandler } from 'express';
import type { AnyZodObject, ZodTypeAny } from 'zod';
import type { ValidationMarker } from '../http/validate';
import type { AuthMarker } from '../auth/authenticate';
import { OpenAPIRegistry, registerRoute } from './openapi-registry';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

export interface RouteDocOptions {
  summary: string;
  tags: string[];
  responses: Record<number, { description: string; schema?: ZodTypeAny }>;
  /** Only needed when no `validate(schema, 'params'|'query')` middleware is
   * present for the doc router to infer from. */
  params?: AnyZodObject;
  query?: AnyZodObject;
  /**
   * Overrides the body schema documented in OpenAPI, independent of what
   * `validateBody(...)` actually validates against. Needed when the real
   * validation schema contains a Zod type `zod-to-openapi` cannot safely
   * introspect (e.g. `z.coerce.bigint()`, whose own `.isOptional()` check
   * throws instead of failing gracefully) — `validateBody` still enforces
   * the real schema; only the *documented* shape differs.
   */
  body?: ZodTypeAny;
}

function hasValidationMarker(fn: unknown): fn is RequestHandler & ValidationMarker {
  return typeof fn === 'function' && '__validationTarget' in fn;
}

function hasAuthMarker(fn: unknown): fn is RequestHandler & AuthMarker {
  return typeof fn === 'function' && '__requiresAuth' in fn;
}

/** Recovers `request.body`/`params`/`query` schemas and `requiresAuth` by
 * inspecting the middleware chain, so callers never repeat what's already
 * expressed via `validateBody(schema)`/`authenticate(signer)`. */
function inspectMiddleware(middleware: RequestHandler[]) {
  let body: ZodTypeAny | undefined;
  let params: AnyZodObject | undefined;
  let query: AnyZodObject | undefined;
  let requiresAuth = false;

  for (const fn of middleware) {
    if (hasValidationMarker(fn)) {
      if (fn.__validationTarget === 'body') body = fn.__validationSchema;
      if (fn.__validationTarget === 'params') params = fn.__validationSchema as AnyZodObject;
      if (fn.__validationTarget === 'query') query = fn.__validationSchema as AnyZodObject;
    }
    if (hasAuthMarker(fn)) requiresAuth = true;
  }

  return { body, params, query, requiresAuth };
}

/**
 * Wraps an Express `Router` so each route registration also documents itself
 * in the shared `OpenAPIRegistry` — defining the route IS defining its
 * OpenAPI entry, so a new/changed endpoint can never drift from `/docs.json`
 * the way a hand-maintained, separate `docs/openapi.ts` route list could.
 * Request body/params/query schemas and the bearer-auth requirement are
 * inferred from `validateBody`/`validate`/`authenticate`/`trustGatewayIdentity`
 * already present in the middleware chain — only response shapes and a
 * summary/tags need to be supplied per route.
 */
export function createDocumentedRouter() {
  const router = Router();
  const registry = new OpenAPIRegistry();

  function add(method: Method) {
    return (path: string, doc: RouteDocOptions, ...middleware: RequestHandler[]) => {
      const inferred = inspectMiddleware(middleware);

      registerRoute(registry, {
        method,
        path,
        summary: doc.summary,
        tags: doc.tags,
        requiresAuth: inferred.requiresAuth,
        request: {
          body: doc.body ?? inferred.body,
          params: doc.params ?? inferred.params,
          query: doc.query ?? inferred.query,
        },
        responses: doc.responses,
      });

      router[method](path, ...middleware);
      return router;
    };
  }

  return {
    router,
    registry,
    get: add('get'),
    post: add('post'),
    put: add('put'),
    patch: add('patch'),
    delete: add('delete'),
  };
}

export type DocumentedRouter = ReturnType<typeof createDocumentedRouter>;
