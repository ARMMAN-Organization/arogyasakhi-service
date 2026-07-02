# risk-referral-service

Risk assessments, flags, referrals and follow-ups. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run
```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve risk-referral-service   # http://localhost:3005/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
