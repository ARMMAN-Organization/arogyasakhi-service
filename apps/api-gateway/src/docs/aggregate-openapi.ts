import type { OpenAPIObject, PathsObject, SchemasObject } from 'openapi3-ts';

/** A downstream service whose OpenAPI doc should be folded into the merged spec. */
export interface DocsService {
  /** Stable short key, used for namespacing schema collisions and log context. */
  readonly key: string;
  /** Base URL of the service (host only); its spec lives at `${url}/api/v1/docs.json`. */
  readonly url: string;
}

export interface AggregateOptions {
  readonly services: readonly DocsService[];
  /** `info` block of the merged document. */
  readonly info: { title: string; version: string; description?: string };
  /** `servers` list of the merged document (the gateway's own public URL(s)). */
  readonly servers: readonly { url: string; description?: string }[];
  /** Injected so tests can stub network + timing; default to real fetch/clock. */
  readonly fetcher?: (
    url: string,
  ) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;
  readonly logger?: { warn: (msg: string) => void };
  /** Cache lifetime for the merged doc, ms. Set 0 to disable caching. */
  readonly cacheTtlMs?: number;
  /** Injected clock (ms). Defaults to `Date.now`; overridden in tests. */
  readonly now?: () => number;
}

const DOCS_PATH = '/api/v1/docs.json';
const DEFAULT_TTL_MS = 60_000;

/** Minimal shape guard: an OpenAPI doc must at least carry a `paths` object. */
function isOpenApiDoc(value: unknown): value is OpenAPIObject {
  return typeof value === 'object' && value !== null && 'paths' in value;
}

/**
 * Fetches one service's OpenAPI doc, returning `null` (never throwing) on any
 * failure — network error, non-200, or malformed body — so one down service
 * can be skipped without failing the whole aggregated page.
 */
async function fetchServiceDoc(
  service: DocsService,
  fetcher: NonNullable<AggregateOptions['fetcher']>,
  logger: NonNullable<AggregateOptions['logger']>,
): Promise<OpenAPIObject | null> {
  const target = `${service.url}${DOCS_PATH}`;
  try {
    const res = await fetcher(target);
    if (!res.ok) {
      logger.warn(`docs: skipping "${service.key}" — ${target} returned HTTP ${res.status}`);
      return null;
    }
    const body = await res.json();
    if (!isOpenApiDoc(body)) {
      logger.warn(`docs: skipping "${service.key}" — ${target} returned a non-OpenAPI body`);
      return null;
    }
    return body;
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    logger.warn(`docs: skipping "${service.key}" — ${target} unreachable (${reason})`);
    return null;
  }
}

/**
 * Merges one service's doc into the accumulators. Paths are expected to be
 * disjoint across services; a genuine duplicate is last-wins + warn. Schema
 * names that collide across services are namespaced with the service key and
 * their `$ref`s rewritten, so no service silently loses a schema.
 */
function mergeDoc(
  service: DocsService,
  doc: OpenAPIObject,
  paths: PathsObject,
  schemas: SchemasObject,
  logger: NonNullable<AggregateOptions['logger']>,
): void {
  const incomingSchemas = (doc.components?.schemas ?? {}) as SchemasObject;
  const renames = new Map<string, string>();
  for (const name of Object.keys(incomingSchemas)) {
    if (name in schemas) {
      const namespaced = `${service.key}_${name}`;
      renames.set(name, namespaced);
      logger.warn(
        `docs: schema "${name}" from "${service.key}" collides — renamed to "${namespaced}"`,
      );
    }
  }

  // Rewrite $refs in this service's slice only when it had a rename, so the
  // renamed schema and every reference to it stay consistent.
  const rewrite = <T>(value: T): T => {
    if (renames.size === 0) return value;
    let json = JSON.stringify(value);
    for (const [from, to] of renames) {
      json = json.split(`#/components/schemas/${from}`).join(`#/components/schemas/${to}`);
    }
    return JSON.parse(json) as T;
  };

  for (const [name, schema] of Object.entries(incomingSchemas)) {
    schemas[renames.get(name) ?? name] = rewrite(schema);
  }

  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (path in paths) {
      logger.warn(`docs: path "${path}" defined by more than one service — "${service.key}" wins`);
    }
    paths[path] = rewrite(item);
  }
}

interface CacheEntry {
  doc: OpenAPIObject;
  expiresAt: number;
}

/**
 * Builds an aggregator that fetches every service's `/docs.json` and merges
 * them into one OpenAPI document (paths grouped by their original tags, so
 * Swagger UI renders per-service sections). The result is cached in memory for
 * `cacheTtlMs` so repeated page loads don't re-fetch every service each time.
 *
 * A service that is down / errors / returns junk is skipped with a warning —
 * the page still renders for every service that is up.
 */
export function createOpenApiAggregator(options: AggregateOptions): () => Promise<OpenAPIObject> {
  const fetcher =
    options.fetcher ??
    ((url: string) =>
      fetch(url) as unknown as ReturnType<NonNullable<AggregateOptions['fetcher']>>);
  const logger = options.logger ?? { warn: (msg: string) => console.warn(msg) };
  const ttl = options.cacheTtlMs ?? DEFAULT_TTL_MS;
  const now = options.now ?? Date.now;

  let cache: CacheEntry | null = null;

  async function build(): Promise<OpenAPIObject> {
    const paths: PathsObject = {};
    const schemas: SchemasObject = {};

    const docs = await Promise.all(
      options.services.map((service) => fetchServiceDoc(service, fetcher, logger)),
    );

    options.services.forEach((service, i) => {
      const doc = docs[i];
      if (doc) mergeDoc(service, doc, paths, schemas, logger);
    });

    return {
      openapi: '3.0.3',
      info: options.info,
      servers: [...options.servers],
      paths,
      components: {
        securitySchemes: {
          bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
        },
        ...(Object.keys(schemas).length > 0 ? { schemas } : {}),
      },
    };
  }

  return async function aggregate(): Promise<OpenAPIObject> {
    const current = now();
    if (cache && current < cache.expiresAt) return cache.doc;
    const doc = await build();
    if (ttl > 0) cache = { doc, expiresAt: current + ttl };
    return doc;
  };
}
