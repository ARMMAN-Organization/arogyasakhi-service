import type { OpenAPIObject } from 'openapi3-ts';
import {
  createOpenApiAggregator,
  type AggregateOptions,
  type DocsService,
} from './aggregate-openapi';

// --- fixtures ---------------------------------------------------------------

const authDoc: OpenAPIObject = {
  openapi: '3.0.3',
  info: { title: 'Auth Service', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3002' }],
  paths: {
    '/auth/login': {
      post: { summary: 'Log in', tags: ['Auth'], responses: { 200: { description: 'ok' } } },
    },
    '/me': {
      get: { summary: 'Profile', tags: ['Users'], responses: { 200: { description: 'ok' } } },
    },
  },
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
};

const beneficiaryDoc: OpenAPIObject = {
  openapi: '3.0.3',
  info: { title: 'Beneficiary Service', version: '1.0.0' },
  servers: [{ url: 'http://localhost:3001' }],
  paths: {
    '/beneficiaries': {
      get: { summary: 'List', tags: ['Beneficiaries'], responses: { 200: { description: 'ok' } } },
    },
  },
  components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
};

const SERVICES: readonly DocsService[] = [
  { key: 'auth', url: 'http://localhost:3002' },
  { key: 'beneficiary', url: 'http://localhost:3001' },
];

/** Builds an ok Response-like object wrapping a JSON body. */
const okRes = (body: unknown) => ({ ok: true, status: 200, json: async () => body });

/** Fetcher that routes each service URL to a supplied doc (or a thrown/failed response). */
function fetcherFor(map: Record<string, unknown | 'network-error' | { status: number }>) {
  return async (url: string) => {
    const key = Object.keys(map).find((u) => url.startsWith(u));
    const entry = key ? map[key] : undefined;
    if (entry === 'network-error') throw new Error('ECONNREFUSED');
    if (entry && typeof entry === 'object' && 'status' in entry) {
      return { ok: false, status: (entry as { status: number }).status, json: async () => ({}) };
    }
    return okRes(entry);
  };
}

const baseOpts = (over: Partial<AggregateOptions> = {}): AggregateOptions => ({
  services: SERVICES,
  info: { title: 'Arogya Sakhi — Platform API', version: '1.0.0', description: 'all services' },
  servers: [{ url: 'http://localhost:3000/api/v1', description: 'Local (gateway)' }],
  logger: { warn: jest.fn() },
  cacheTtlMs: 0,
  ...over,
});

// --- happy path -------------------------------------------------------------

describe('createOpenApiAggregator — happy path', () => {
  it('merges paths from multiple services', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': beneficiaryDoc,
        }),
      }),
    );
    const doc = await agg();
    expect(Object.keys(doc.paths).sort()).toEqual(['/auth/login', '/beneficiaries', '/me']);
  });

  it('preserves each operation object unchanged', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': beneficiaryDoc,
        }),
      }),
    );
    const doc = await agg();
    expect(doc.paths['/auth/login'].post.summary).toBe('Log in');
    expect(doc.paths['/beneficiaries'].get.responses[200].description).toBe('ok');
  });

  it('sets servers to the gateway URL, not the service URLs', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': beneficiaryDoc,
        }),
      }),
    );
    const doc = await agg();
    expect(doc.servers).toEqual([
      { url: 'http://localhost:3000/api/v1', description: 'Local (gateway)' },
    ]);
  });

  it('includes the shared bearerAuth security scheme', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': beneficiaryDoc,
        }),
      }),
    );
    const doc = await agg();
    expect(doc.components?.securitySchemes?.bearerAuth).toMatchObject({
      type: 'http',
      scheme: 'bearer',
    });
  });

  it('uses the configured platform title/description', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': beneficiaryDoc,
        }),
      }),
    );
    const doc = await agg();
    expect(doc.info.title).toBe('Arogya Sakhi — Platform API');
  });

  it('keeps original per-service tags for grouping', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': beneficiaryDoc,
        }),
      }),
    );
    const doc = await agg();
    expect(doc.paths['/auth/login'].post.tags).toEqual(['Auth']);
    expect(doc.paths['/beneficiaries'].get.tags).toEqual(['Beneficiaries']);
  });
});

// --- resilience -------------------------------------------------------------

describe('createOpenApiAggregator — resilience (skip + warn)', () => {
  it('skips an unreachable service but keeps the others', async () => {
    const warn = jest.fn();
    const agg = createOpenApiAggregator(
      baseOpts({
        logger: { warn },
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': 'network-error',
        }),
      }),
    );
    const doc = await agg();
    expect(Object.keys(doc.paths)).toContain('/auth/login');
    expect(Object.keys(doc.paths)).not.toContain('/beneficiaries');
  });

  it('logs a warning naming the skipped service', async () => {
    const warn = jest.fn();
    const agg = createOpenApiAggregator(
      baseOpts({
        logger: { warn },
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': 'network-error',
        }),
      }),
    );
    await agg();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('beneficiary'));
  });

  it('skips a service returning a non-200 status', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': { status: 500 },
        }),
      }),
    );
    const doc = await agg();
    expect(Object.keys(doc.paths)).toEqual(['/auth/login', '/me']);
  });

  it('skips a service returning a non-OpenAPI (malformed) body', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': authDoc,
          'http://localhost:3001': { not: 'a spec' },
        }),
      }),
    );
    const doc = await agg();
    expect(Object.keys(doc.paths)).not.toContain('/beneficiaries');
    expect(Object.keys(doc.paths)).toContain('/auth/login');
  });

  it('returns a valid empty-paths doc when all services are down', async () => {
    const agg = createOpenApiAggregator(
      baseOpts({
        fetcher: fetcherFor({
          'http://localhost:3002': 'network-error',
          'http://localhost:3001': 'network-error',
        }),
      }),
    );
    const doc = await agg();
    expect(doc.openapi).toBe('3.0.3');
    expect(doc.paths).toEqual({});
  });
});

// --- collisions -------------------------------------------------------------

describe('createOpenApiAggregator — collisions', () => {
  it('duplicate path across services is last-wins + warn', async () => {
    const warn = jest.fn();
    const dupA = {
      ...authDoc,
      paths: { '/shared': { get: { summary: 'A', tags: ['A'], responses: {} } } },
    };
    const dupB = {
      ...beneficiaryDoc,
      paths: { '/shared': { get: { summary: 'B', tags: ['B'], responses: {} } } },
    };
    const agg = createOpenApiAggregator(
      baseOpts({
        logger: { warn },
        fetcher: fetcherFor({ 'http://localhost:3002': dupA, 'http://localhost:3001': dupB }),
      }),
    );
    const doc = await agg();
    // beneficiary is merged after auth, so it wins.
    expect(doc.paths['/shared'].get.summary).toBe('B');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('/shared'));
  });

  it('namespaces a colliding schema name and rewrites its $ref', async () => {
    const warn = jest.fn();
    const withSchemaA: OpenAPIObject = {
      ...authDoc,
      paths: {
        '/auth/login': {
          post: {
            summary: 'Log in',
            tags: ['Auth'],
            responses: {
              200: {
                description: 'ok',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Foo' } } },
              },
            },
          },
        },
      },
      components: { schemas: { Foo: { type: 'object', properties: { a: { type: 'string' } } } } },
    };
    const withSchemaB: OpenAPIObject = {
      ...beneficiaryDoc,
      paths: {
        '/beneficiaries': {
          get: {
            summary: 'List',
            tags: ['Beneficiaries'],
            responses: {
              200: {
                description: 'ok',
                content: { 'application/json': { schema: { $ref: '#/components/schemas/Foo' } } },
              },
            },
          },
        },
      },
      components: { schemas: { Foo: { type: 'object', properties: { b: { type: 'number' } } } } },
    };
    const agg = createOpenApiAggregator(
      baseOpts({
        logger: { warn },
        fetcher: fetcherFor({
          'http://localhost:3002': withSchemaA,
          'http://localhost:3001': withSchemaB,
        }),
      }),
    );
    const doc = await agg();
    const schemas = doc.components?.schemas ?? {};
    // Both survive: original Foo (auth, first) + namespaced beneficiary_Foo.
    expect(schemas.Foo).toBeDefined();
    expect(schemas.beneficiary_Foo).toBeDefined();
    // beneficiary's operation $ref now points at the renamed schema.
    const ref =
      doc.paths['/beneficiaries'].get.responses[200].content['application/json'].schema.$ref;
    expect(ref).toBe('#/components/schemas/beneficiary_Foo');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('beneficiary_Foo'));
  });
});

// --- caching ----------------------------------------------------------------

describe('createOpenApiAggregator — caching', () => {
  it('does not re-fetch within the TTL window', async () => {
    const fetcher = jest.fn(
      fetcherFor({ 'http://localhost:3002': authDoc, 'http://localhost:3001': beneficiaryDoc }),
    );
    let clock = 1000;
    const agg = createOpenApiAggregator(
      baseOpts({ fetcher, cacheTtlMs: 60_000, now: () => clock }),
    );
    await agg();
    clock = 30_000; // still within TTL
    await agg();
    // 2 services x 1 fetch each = 2 calls total, not 4.
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('re-fetches after the TTL expires', async () => {
    const fetcher = jest.fn(
      fetcherFor({ 'http://localhost:3002': authDoc, 'http://localhost:3001': beneficiaryDoc }),
    );
    let clock = 1000;
    const agg = createOpenApiAggregator(
      baseOpts({ fetcher, cacheTtlMs: 60_000, now: () => clock }),
    );
    await agg();
    clock = 1000 + 60_001; // past TTL
    await agg();
    expect(fetcher).toHaveBeenCalledTimes(4);
  });
});
