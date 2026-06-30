# notification-escalation-service

Event-driven notifications and escalations. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve notification-escalation-service   # http://localhost:3009/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
