# cms-content-service

Health-education content and versioned offline content packs (wraps Strapi). See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

> Backed by Strapi; this service exposes content packs to clients via the API.

## Run
```bash
cp .env.example .env
npx nx serve cms-content-service   # http://localhost:3014/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
