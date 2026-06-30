# sync-service

Idempotent offline batch upload and download, delta packaging. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve sync-service   # http://localhost:3010/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
