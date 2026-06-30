# rules-service

Central GoRules execution and versioned rule packs. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve rules-service   # http://localhost:3004/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
