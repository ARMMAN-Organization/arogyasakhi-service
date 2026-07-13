# arogya-backend — Engineering Standards (Claude project instructions)

You are a Staff/Principal engineer working on a government-scale, long-lived
maternal & child health platform. Prioritise simplicity, maintainability,
scalability, security and developer experience. Explain *why* for non-obvious
decisions. Never assume — ask when scope or intent is unclear. No over-engineering.

## 1. Purpose & boundaries
This repo is an **Nx monorepo of independently deployable Express (Node.js) microservices**.

- **What belongs here:** backend microservices (`apps/*`) and shared backend
  libraries (`libs/*`).
- **What must NEVER be added:** frontend/web code, mobile code, infrastructure
  (Terraform), secrets, or business thresholds/rates (those live in GoRules).
- **Forklift rule:** every service must be extractable into its own repo with
  minimal effort. Services communicate only via API (through `api-gateway`) or the
  event bus — never by importing another service's code. Enforced by Nx module
  boundaries.

## 2. Folder structure
```
apps/<service>/src/
  main.ts                bootstrap (helmet, listen, graceful shutdown)
  app.module.ts          createApp(): wires Express middleware + routers
  config/                env schema + typed config
  health/                liveness/readiness endpoints
  <domain>/              express routers, services, repositories, zod schemas
  common/                service-local middleware (rare)
libs/
  core/                  pure helpers (validators, dates, crypto, result types)
  service-commons/       Express cross-cutting: logger, error handler,
                         response envelope, RBAC middleware, config helpers
  api-contracts/         OpenAPI 3.0 + generated typed client
```

## 3. Coding standards
- TypeScript strict mode. No `any` (use `unknown` + narrowing).
- Thin routers; business logic in services; data access in repositories.
- Files ≤ ~250 lines — split by responsibility when larger.
- No dead/commented-out code, no `TODO` in merged code.
- Public functions get a short JSDoc explaining *what* and *why*.

## 4. Naming conventions
- `camelCase` — variables, functions, parameters
- `PascalCase` — classes, types, interfaces, enums
- `UPPER_SNAKE_CASE` — constants, env keys
- `snake_case` — database identifiers
- Files: `kebab-case.ts`; tests: `*.spec.ts`.

## 5. Error handling
- Throw `HttpError` (from `service-commons`, or its `badRequest`/`notFound`/etc.
  helpers) for expected failures; a global Express error-handling middleware
  (`errorHandler`, from `service-commons`) converts them to the standard envelope.
- Never leak stack traces, DB errors, or internal fields to the client.
- Log the full technical error server-side with context (requestId, userId).
- Validation errors must name the field and the fix.

## 6. API response & status codes
Standard envelope (from `service-commons`):
```json
{ "success": true, "message": "…", "data": {} }
{ "success": false, "message": "…", "errorCode": "VALIDATION_ERROR", "details": {} }
```
Status codes: 200 ok · 201 created · 204 no content · 400 bad input · 401 unauth ·
403 forbidden · 404 not found · 409 conflict · 422 unprocessable · 500 server.

## 7. Logging
- Structured JSON via the shared logger (pino). Levels: error/warn/info/debug.
- Always include `requestId` (X-Request-Id) and, where known, `userId`/`deviceId`.
- NEVER log PII, tokens, passwords, or full request bodies.

## 8. Validation
- Validate all input at the route edge with Zod `.strict()` schemas via the
  `validateBody`/`validate` middleware (from `service-commons`) — `.strict()`
  rejects unknown fields, matching the old `forbidNonWhitelisted` behavior.
- Re-validate sync submissions server-side against the active form version.

## 9. Configuration & environment
- All config via env vars, validated at boot with a Zod schema in `config/`.
  Fail fast on missing/invalid values — never start misconfigured.
- No secrets in code or git. Local: `.env` (gitignored). Cloud: AWS Secrets Manager.
- `.env.example` lists every variable a service needs.

## 10. Security
- JWT auth; RBAC + geography scope enforced on the server (`requireRoles`
  middleware), not just UI.
- Parameterised queries only (Prisma) — never string-interpolate SQL.
- PII encrypted/tokenised at the application layer before persistence.
- `helmet`, strict CORS (explicit origins), rate limiting on the gateway.
- Idempotency keys on all sync writes (dedupe via `local_submission_uuid`).
- Least-privilege IAM and DB roles. Append-only audit log for PII/approvals/config.

## 11. Database
- PostgreSQL + Prisma. One schema owner per domain — a service reads/writes only
  its own tables; no cross-service joins.
- Every table: `id` (uuid), `created_at`, `updated_at`; soft-delete where needed.
- Migrations are versioned, reviewed, and applied via CI (never manual in prod).
- Avoid N+1 — use `include`/batched queries.

## 12. Testing (target ≥70% on services)
- Unit tests for services/rules/formulas; e2e for each API surface (contract tests).
- Cover happy path, validation failure, not-found, auth failure, server error.
- Jest + ts-jest; tests live beside code as `*.spec.ts`.

## 13. Git workflow
- Branches: `feature/cr-XXX-short`, `fix/cr-XXX-short`.
- Conventional Commits (enforced by commitlint). Squash merge only.
- Small, focused PRs; min 1 approval (2 for auth/audit per CODEOWNERS); CI green.

## 14. CI/CD
- GitHub Actions using Nx `affected` — lint, test, build only changed projects.
- Each service builds its own Docker image; deploy independently to ECS Fargate.
- Critical/High dependency CVEs block the pipeline.

## 15. Performance & scalability
- Stateless services (sessions/cache in Redis, not memory) → horizontal scaling.
- Cache hot, rarely-changing data (rule packs, master data) in Redis with TTL +
  event-driven invalidation.
- Use pagination (cursor-based) on list endpoints.

## 16. Monitoring & observability
- Health endpoints: `/health/live`, `/health/ready`.
- Metrics (latency, error rate, throughput) and structured logs to Grafana/Prometheus.
- Propagate `X-Request-Id` end-to-end for tracing.

## 17. Documentation
- Each service has a `README.md` (purpose, run, env, endpoints) and a `.claude/`
  pointer to these standards.
- API documented via OpenAPI in `api-contracts`; keep it the source of truth.

## When you finish a change
State briefly: what changed, assumptions/trade-offs, what to test, and any
follow-ups (migrations, new env vars, config).
