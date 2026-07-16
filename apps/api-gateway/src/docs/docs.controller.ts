import { Router, type NextFunction, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { appConfig } from '../config/app-config';
import { createOpenApiAggregator, type DocsService } from './aggregate-openapi';

/**
 * Every service that publishes an OpenAPI doc, in the order sections should
 * appear. `key` namespaces any future schema-name collision and labels logs;
 * `url` is the service's base URL (its spec is fetched from `${url}/api/v1/docs.json`).
 */
const DOCS_SERVICES: readonly DocsService[] = [
  { key: 'auth', url: appConfig.AUTH_SERVICE_URL },
  { key: 'beneficiary', url: appConfig.BENEFICIARY_SERVICE_URL },
  { key: 'visits', url: appConfig.VISIT_FORM_SERVICE_URL },
  { key: 'rules', url: appConfig.RULES_SERVICE_URL },
  { key: 'referrals', url: appConfig.RISK_REFERRAL_SERVICE_URL },
  { key: 'closures', url: appConfig.CLOSURE_REOPEN_SERVICE_URL },
  { key: 'approvals', url: appConfig.APPROVAL_SERVICE_URL },
  { key: 'incentives', url: appConfig.INCENTIVE_WAGES_SERVICE_URL },
  { key: 'notifications', url: appConfig.NOTIFICATION_ESCALATION_SERVICE_URL },
  { key: 'sync', url: appConfig.SYNC_SERVICE_URL },
  { key: 'media', url: appConfig.MEDIA_SERVICE_URL },
  { key: 'audit', url: appConfig.AUDIT_SERVICE_URL },
];

const PLATFORM_INFO = {
  title: 'Arogya Sakhi — Platform API',
  version: '1.0.0',
  description: 'Unified API reference for all services. Endpoints are grouped by service.',
};

/**
 * Trims Swagger UI's generous default header spacing and aligns the info block,
 * Servers row, and Authorize button to one left edge — the stock layout leaves
 * a large empty band between the title and the first endpoint. Scoped to the
 * header (`.info`, `.scheme-container`) so operation rendering is untouched.
 */
const CUSTOM_CSS = `
  .swagger-ui .topbar { display: none; }
  .swagger-ui .info { margin: 20px 0; }
  .swagger-ui .info hgroup.main { margin: 0 0 8px; }
  .swagger-ui .info .title { margin: 0 0 4px; }
  .swagger-ui .info .description { margin: 0; }
  .swagger-ui .info .description p { margin: 0; }
  .swagger-ui .scheme-container { margin: 0 0 20px; padding: 12px 0; box-shadow: none; border-bottom: 1px solid #e8e8e8; }
  .swagger-ui .scheme-container .schemes { align-items: center; }
`;

export interface DocsRouterOptions {
  /** Defaults to `false` in production, `true` otherwise — matches
   * `createSwaggerRouter`'s posture (each service already 404s its own
   * `/docs` in prod). Mounting the gateway's aggregated UI unconditionally
   * would keep `/api/v1/docs` reachable in prod regardless of what any
   * individual service decides, so this must gate the same way. */
  enabled?: boolean;
}

/**
 * Mounts the single aggregated Swagger UI for the whole platform:
 *   GET /docs       — interactive Swagger UI over the merged spec
 *   GET /docs.json  — the raw merged OpenAPI 3.0 document
 *
 * The gateway fetches each service's own `/docs.json` and merges them at
 * request time (cached briefly) — it never imports service code, preserving
 * the forklift / module-boundary rule. Mount this on the router that carries
 * the `/api/v1` prefix.
 */
export function createDocsRouter(options: DocsRouterOptions = {}): Router {
  const router = Router();
  const { enabled = process.env.NODE_ENV !== 'production' } = options;

  if (!enabled) {
    return router;
  }

  const servers =
    appConfig.PUBLIC_BASE_URLS.length > 0
      ? appConfig.PUBLIC_BASE_URLS.map((url) => ({ url: `${url}/api/v1` }))
      : [{ url: `http://localhost:${appConfig.PORT}/api/v1`, description: 'Local (gateway)' }];

  const aggregate = createOpenApiAggregator({
    services: DOCS_SERVICES,
    info: PLATFORM_INFO,
    servers,
  });

  router.get('/docs.json', async (_req, res, next) => {
    try {
      res.json(await aggregate());
    } catch (err) {
      next(err);
    }
  });

  // swagger-ui-express serves its static assets relative to the mount path and
  // needs the spec at setup time. Because the merged spec is async + cached, we
  // resolve it per-request and hand swaggerUi.setup the fresh document.
  router.use('/docs', swaggerUi.serve, async (req: Request, res: Response, next: NextFunction) => {
    try {
      const document = await aggregate();
      swaggerUi.setup(document, {
        customSiteTitle: PLATFORM_INFO.title,
        customCss: CUSTOM_CSS,
      })(req, res, next);
    } catch (err) {
      next(err);
    }
  });

  return router;
}
