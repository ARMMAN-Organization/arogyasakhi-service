# media-service

Signed-URL media uploads and metadata tracking. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve media-service   # http://localhost:3011/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
