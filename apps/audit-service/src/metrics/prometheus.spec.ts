import { httpRequestDurationSeconds, httpRequestsTotal, registry } from './prometheus';

describe('prometheus metrics registry', () => {
  beforeEach(() => {
    httpRequestsTotal.reset();
    httpRequestDurationSeconds.reset();
  });

  it('exposes audit_service_http_requests_total in Prometheus text format', async () => {
    httpRequestsTotal.inc({ method: 'POST', route: '/analytics/events/batch', status_code: '201' });

    const text = await registry.metrics();

    expect(text).toContain('audit_service_http_requests_total');
    expect(text).toContain('method="POST"');
    expect(text).toContain('status_code="201"');
  });

  it('exposes audit_service_http_request_duration_seconds', async () => {
    httpRequestDurationSeconds.observe(
      { method: 'GET', route: '/analytics/events', status_code: '200' },
      0.042,
    );

    const text = await registry.metrics();

    expect(text).toContain('audit_service_http_request_duration_seconds');
  });

  it('includes Node.js default process metrics (collectDefaultMetrics)', async () => {
    const text = await registry.metrics();

    expect(text).toContain('process_cpu_user_seconds_total');
  });
});
