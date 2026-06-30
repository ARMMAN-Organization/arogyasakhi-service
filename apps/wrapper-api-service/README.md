# wrapper-api-service

Facade over external channels (WhatsApp/TURN, IVR/Hungama, LLM/ArtPark). See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

> Provider SDKs/adapters live here so no other service embeds them.

## Run
```bash
cp .env.example .env
npx nx serve wrapper-api-service   # http://localhost:3012/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
