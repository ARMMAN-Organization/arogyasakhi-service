# incentive-wages-service

Incentive events and wage calculation. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve incentive-wages-service   # http://localhost:3008/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
