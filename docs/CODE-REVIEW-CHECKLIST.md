# Code Review Checklist — arogya-backend

## Correctness
- [ ] Solves the stated requirement; edge cases covered
- [ ] Happy path + validation + not-found + auth + server-error all handled

## Architecture & boundaries
- [ ] No imports from another service (forklift rule); shared code via `libs/*`
- [ ] Thin controller, logic in service, data access in repository
- [ ] Service touches only its own DB tables

## Security
- [ ] No secrets/PII in code, logs, or responses
- [ ] Input validated with DTOs; parameterised queries only
- [ ] RBAC/scope enforced server-side; idempotency on sync writes

## Quality
- [ ] Correct HTTP status + standard response envelope
- [ ] Structured logs with requestId; no PII logged
- [ ] Files ≤ ~250 lines; clear names; no dead code/TODOs
- [ ] Tests added/updated; coverage ≥ 70%

## Ops
- [ ] Migrations versioned & reversible; new env vars in `.env.example`
- [ ] Conventional commit messages; PR scoped and small
