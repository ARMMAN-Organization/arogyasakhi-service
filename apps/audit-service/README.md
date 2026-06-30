# audit-service

Append-only audit trail. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve audit-service   # http://localhost:3013/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
