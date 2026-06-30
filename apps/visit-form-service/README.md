# visit-form-service

Visit schedules and instances, form definitions and submissions. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve visit-form-service   # http://localhost:3003/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
