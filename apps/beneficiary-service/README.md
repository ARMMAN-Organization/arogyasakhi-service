# beneficiary-service

Owns the beneficiary lifecycle: PII vault, cases (mother/child), consent, status
history and duplicate detection. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md)
for engineering standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve beneficiary-service   # http://localhost:3001/api/v1
```
Health: `GET /api/v1/health/live`, `GET /api/v1/health/ready`.

## Endpoints (initial)
- `GET  /api/v1/beneficiaries`
- `POST /api/v1/beneficiaries`
