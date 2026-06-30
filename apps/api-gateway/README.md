# api-gateway

Single ingress: JWT validation, RBAC, rate limiting, request logging and routing. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

> Routing/proxy configuration to downstream services is added here; it owns no domain data.

## Run
```bash
cp .env.example .env
npx nx serve api-gateway   # http://localhost:3000/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
