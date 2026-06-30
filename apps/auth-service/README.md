# auth-service

Authentication, JWT and refresh tokens, sessions, device registry. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve auth-service   # http://localhost:3002/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
