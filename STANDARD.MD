# Engineering Standards

Development, security, and architecture standards for `arogyasakhi-service`.

---

## Quality

| Area | Standard |
| --- | --- |
| **TypeScript** | Strict mode, no `any` — use `unknown` + narrowing |
| **Layered code** | Thin controllers → logic in services → data access in repositories |
| **Small files** | ≤ ~250 lines; no dead/commented code, no `TODO` in merged code; public functions get short JSDoc (what + why) |
| **Testing** | ≥70% on services — unit tests for services/rules/formulas, e2e/contract tests per API; cover happy path, validation failure, not-found, auth failure, server error; Jest + `*.spec.ts` beside code |
| **CI/CD** | GitHub Actions with Nx `affected` (lint/test/build only changed); each service its own Docker image, deploy independently to ECS Fargate |
| **Git workflow** | `feature/cr-XXX-short` branches, Conventional Commits (commitlint), squash merge, small PRs, min 1 approval (2 for auth/audit), CI green |
| **Approval-gated workflow** | clarify → plan → test cases → code → summary |

---

## Security

| Area | Standard |
| --- | --- |
| **Auth** | JWT; RBAC + geography scope enforced server-side (guards), not just UI |
| **SQL injection** | Parameterised queries only (Prisma), never string-interpolate SQL |
| **PII** | Encrypted/tokenised at the application layer before persistence; append-only audit log for PII/approvals/config |
| **Hardening** | `helmet`, strict CORS (explicit origins), rate limiting on the gateway |
| **Idempotency** | Keys on all sync writes (dedupe via `local_submission_uuid`) |
| **Secrets** | None in code/git; local `.env` (gitignored), cloud AWS Secrets Manager; `.env.example` lists all vars |
| **Least privilege** | IAM and DB roles |
| **Config** | Env vars validated at boot with Zod, fail fast; never start misconfigured |
| **CVEs** | Critical/High dependency CVEs block the pipeline |
| **No leaks** | Never expose stack traces/DB errors to client; never log PII, tokens, passwords, or full request bodies |

---

## Architecture, API, Data & Ops

| Area | Standard |
| --- | --- |
| **Forklift rule** | Every service extractable into its own repo; services talk only via API (gateway) or event bus, never import each other's code (Nx module boundaries) |
| **Naming** | `camelCase` vars/functions, `PascalCase` classes/types/providers, `UPPER_SNAKE_CASE` constants/env, `snake_case` DB identifiers; files `kebab-case.ts`, tests `*.spec.ts` |
| **Error handling** | Nest exceptions → global exception filter → standard envelope; validation errors name the field + fix |
| **API response** | Standard `{ success, message, data }` / `{ success, message, errorCode, details }` envelope; correct status codes (200/201/204/400/401/403/404/409/422/500) |
| **Validation** | class-validator DTOs at controller edge + global `ValidationPipe({ whitelist, forbidNonWhitelisted })`; re-validate sync submissions against active form version |
| **Logging** | Structured JSON (pino) with `requestId` + `userId`/`deviceId` |
| **Database** | PostgreSQL + Prisma; one schema owner per domain, no cross-service joins; every table has `id` (uuid)/`created_at`/`updated_at`; versioned migrations via CI; avoid N+1 |
| **Performance & scalability** | Stateless services (state in Redis), cache hot data with TTL + event-driven invalidation, cursor-based pagination |
| **Observability** | `/health/live` + `/health/ready`, metrics + logs to Grafana/Prometheus, propagate `X-Request-Id` end-to-end |
| **Docs** | Each service `README.md`; OpenAPI in `api-contracts` as source of truth |
