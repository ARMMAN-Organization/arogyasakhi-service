# closure-reopen-service

Closure forms, supervisor review and reopen requests. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve closure-reopen-service   # http://localhost:3006/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
