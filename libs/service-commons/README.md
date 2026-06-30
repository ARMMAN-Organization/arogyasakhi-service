# @armman/service-commons

Shared NestJS cross-cutting concerns used by every service:

- `ResponseInterceptor` — wraps success responses in the standard envelope
- `AllExceptionsFilter` — converts errors to the standard failure envelope (no leaks)
- `RequestIdMiddleware` — X-Request-Id propagation
- `buildLoggerOptions` — structured pino logging with PII redaction
- `RbacGuard` + `@Roles()` — server-side role enforcement
- `loadConfig(schema)` — fail-fast typed env validation (Zod)

Wire these up in each service's `main.ts` / `app.module.ts` (see the reference
`beneficiary-service`).
