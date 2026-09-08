import type { RequestHandler } from 'express';
import { Registry, Counter, Histogram, collectDefaultMetrics } from 'prom-client';

/**
 * Prometheus metrics foundation for the (not-yet-provisioned) Grafana
 * monitoring stack — no Grafana instance/scrape-config exists anywhere in
 * this codebase yet (confirmed repo-wide: no docker-compose service, no
 * dashboard JSON, no Prometheus config). This is the app-side half only:
 * a real, running `/metrics` endpoint today, ready for Grafana to scrape
 * once that infra is actually provisioned.
 */
export const registry = new Registry();
collectDefaultMetrics({ register: registry });

export const httpRequestsTotal = new Counter({
  name: 'audit_service_http_requests_total',
  help: 'Total HTTP requests, labeled by method/route/status_code.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDurationSeconds = new Histogram({
  name: 'audit_service_http_request_duration_seconds',
  help: 'HTTP request duration in seconds, labeled by method/route/status_code.',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

/**
 * Express middleware recording request count/duration per route. Uses
 * `req.route.path` (the matched Express route pattern, e.g. `/analytics/events/batch`)
 * rather than the raw URL, so per-id paths don't explode into unbounded
 * label cardinality — falls back to `req.path` only when no route matched
 * (e.g. a 404), which is a bounded, low-cardinality set in practice.
 */
export const metricsMiddleware: RequestHandler = (req, res, next) => {
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    const route = req.route?.path ?? req.path;
    const labels = { method: req.method, route, status_code: String(res.statusCode) };
    httpRequestsTotal.inc(labels);
    const durationSeconds = Number(process.hrtime.bigint() - start) / 1e9;
    httpRequestDurationSeconds.observe(labels, durationSeconds);
  });
  next();
};
