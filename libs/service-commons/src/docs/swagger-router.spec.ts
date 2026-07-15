import type { OpenAPIObject } from 'openapi3-ts';
import { createSwaggerRouter } from './swagger-router';

const doc = { openapi: '3.0.3', info: { title: 't', version: '1' }, paths: {} } as OpenAPIObject;

describe('createSwaggerRouter production gating', () => {
  const originalEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  it('registers no routes when NODE_ENV=production and enabled is not passed', () => {
    process.env.NODE_ENV = 'production';
    const router = createSwaggerRouter(doc);
    expect(router.stack.length).toBe(0);
  });

  it('registers routes outside production', () => {
    process.env.NODE_ENV = 'development';
    const router = createSwaggerRouter(doc);
    expect(router.stack.length).toBeGreaterThan(0);
  });

  it('can be force-enabled in production via options.enabled', () => {
    process.env.NODE_ENV = 'production';
    const router = createSwaggerRouter(doc, { enabled: true });
    expect(router.stack.length).toBeGreaterThan(0);
  });
});
