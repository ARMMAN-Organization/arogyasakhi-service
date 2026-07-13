# @armman/service-commons

Shared Express cross-cutting concerns used by every service:

- `ok` / `fail` — standard success/failure response envelopes
- `errorHandler` / `notFoundHandler` — converts thrown errors to the standard failure envelope (no leaks)
- `requestId` — X-Request-Id propagation middleware
- `buildLoggerOptions` — structured pino-http logging options with PII redaction
- `requireRoles(...roles)` — server-side role enforcement middleware
- `asyncHandler` — wraps async route handlers so rejections reach `errorHandler`
- `validate` / `validateBody` — Zod-schema request validation middleware
- `HttpError` (+ `badRequest`/`unauthorized`/`forbidden`/`notFound`/`conflict`) — errors carrying an HTTP status
- `loadConfig(schema)` — fail-fast typed env validation (Zod)

Wire these up in each service's `main.ts` / `app.module.ts` (see the reference
`auth-service`).
