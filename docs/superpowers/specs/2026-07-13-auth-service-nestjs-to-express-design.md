# auth-service: NestJS → plain Express (pilot)

**Date:** 2026-07-13
**Status:** Approved design
**Scope:** Pilot conversion of `apps/auth-service` only.

## Goal

Reduce dependency weight by removing NestJS from `auth-service`, replacing it with
plain Express plus a thin set of local helpers. Keep TypeScript, Prisma, Zod, Pino,
and Helmet. **The HTTP contract does not change** — same routes, `api/v1` prefix,
success/failure envelopes, error codes, RBAC behavior, request-id, and redacted logging.

This is a pilot to establish the pattern before the other 15 services are migrated.

## Motivation

The team wants a lighter stack. NestJS pulls in `@nestjs/common`, `@nestjs/core`,
`@nestjs/platform-express`, `@nestjs/testing`, `nestjs-pino`, `reflect-metadata`,
`rxjs`, and `class-validator`/`class-transformer`. Express + Zod + pino-http covers
the same needs with far fewer dependencies.

## Constraints / decisions

- **Language:** stay on TypeScript.
- **Shared `service-commons` lib:** left untouched. It is Nest-based and used by all
  16 services; rewriting it now would break the other 15. auth-service gets **local**
  Express helpers under `src/http`. The pure-data pieces of commons
  (`api-response.ts`: `ApiSuccess`/`ApiFailure`/`ErrorCode`) are framework-agnostic and
  are reused — copied locally so auth-service no longer imports `@armman/service-commons`.
- **Contract:** identical. Pure framework swap, verifiable by equivalence.
- **Build/tooling:** keep Nx + webpack + `project.json` + `Dockerfile` as-is. They build
  plain TS fine; nothing Nest-specific lives there.

## Concept mapping

| NestJS today | Plain Express replacement |
|---|---|
| `NestFactory.create(AppModule)` | `createApp(deps)` returns a configured `express()` app; `main.ts` calls `listen` |
| Modules + DI container | Manual composition root (`container.ts`) wiring Prisma → repo → service → router |
| `@Controller`/`@Get`/`@Post` | `express.Router()` + `asyncHandler` |
| `ResponseInterceptor` (rxjs) | `ok(data)` helper → `res.status(...).json(ok(data))` |
| `AllExceptionsFilter` | Express error middleware `(err, req, res, next)` → same `ApiFailure` |
| `RequestIdMiddleware` | plain `(req,res,next)` middleware |
| `RbacGuard` + `@Roles` + `Reflector` | `requireRoles(...roles)` per-route middleware |
| `ValidationPipe` + class-validator DTO | Zod schema + `validateBody(schema)` middleware |
| `nestjs-pino` `LoggerModule` | `pino-http` middleware (same redaction/customProps) |
| `loadConfig` (Nest `Logger`) | same, `console.error` on failure |
| `@nestjs/testing` spec | plain Jest, construct service with mock repo object |

## Target file structure (auth-service)

```
src/
  main.ts              // loadConfig, createApp(), listen, graceful shutdown (SIGTERM/SIGINT)
  app.ts               // createApp(deps): helmet, cors, pino-http, request-id, routers, error mw
  container.ts         // composition root: PrismaClient, SessionRepository, SessionService
  config/app-config.ts // unchanged (Zod)
  http/
    api-response.ts    // ApiSuccess/ApiFailure/ErrorCode + ok()/fail() helpers (from commons)
    async-handler.ts   // wrap async handlers so throws reach error middleware
    validate.ts        // validateBody(zodSchema) middleware
    request-id.ts      // request-id middleware
    error-handler.ts   // AllExceptions-equivalent error middleware
    rbac.ts            // requireRoles(...roles) middleware
    logger.ts          // pino-http options (redaction, requestId customProp)
  prisma/prisma.ts     // PrismaClient subclass, connect()/disconnect() (no @Injectable)
  health/health.routes.ts   // GET /health/live, GET /health/ready
  sessions/
    session.routes.ts       // GET /sessions, POST /sessions (requireRoles + validateBody)
    session.service.ts      // plain class, constructor(repo)
    session.repository.ts    // plain class, constructor(prisma)
    session.schema.ts        // Zod CreateSessionSchema (replaces class-validator DTO)
    session.service.spec.ts  // plain Jest
```

## package.json changes (auth-service)

- **Remove:** `@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`,
  `@nestjs/testing`, `nestjs-pino`, `reflect-metadata`, `rxjs`, `class-transformer`,
  `class-validator`, `@armman/service-commons`.
- **Add:** `express`, `pino-http`, `pino`, `@types/express`.
- **Keep:** `helmet`, `zod`, `@prisma/client`, `@armman/core` (still framework-agnostic).

## Error-code mapping (preserved exactly)

400→VALIDATION_ERROR, 401→UNAUTHENTICATED, 403→FORBIDDEN, 404→NOT_FOUND,
409→CONFLICT, else→INTERNAL_ERROR. 5xx logs full error server-side with requestId;
client sees generic message. To signal a specific status from a handler, throw an
error carrying a `status` (small `HttpError` helper replaces `HttpException`).

## Logging redaction (preserved exactly)

Redact + remove: `req.headers.authorization`, `req.headers.cookie`,
`req.body.password`, `req.body.token`, `*.pii`. `customProps` attaches
`requestId` from `x-request-id`.

## Verification

1. `nx build auth-service` succeeds.
2. `nx test auth-service` (Jest) passes.
3. Boot the service and confirm identical responses for:
   - `GET /api/v1/health/live` → `{status:"ok"}`
   - `GET /api/v1/health/ready` → `{status:"ok"}` (runs `SELECT 1`)
   - `GET /api/v1/sessions` → success envelope wrapping the list
   - `POST /api/v1/sessions` valid body → 201 success envelope
   - `POST /api/v1/sessions` invalid body → 400 `VALIDATION_ERROR` failure envelope
4. Confirm `x-request-id` echoed on responses and no Nest imports remain
   (`grep -r @nestjs apps/auth-service/src` returns nothing).

## Out of scope

- The other 15 services and the shared `service-commons` lib (future migrations,
  each its own spec).
- Any change to routes, response shapes, or auth semantics.
