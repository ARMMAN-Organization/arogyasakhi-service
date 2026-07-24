# supervisor-operations-service

Supervisor field operations: meetings/training events, attendance, call logs, and
inventory. See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

## Run

```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve supervisor-operations-service   # http://localhost:3016/api/v1
```

Health: `/api/v1/health/live`, `/api/v1/health/ready`.

## Endpoints

- `GET  /api/v1/supervisor-events` — list recent meetings/training events
- `POST /api/v1/supervisor-events` — create a supervisor event
- `GET  /api/v1/inventory-items` — list inventory items (master data)
- `GET  /api/v1/inventory-transactions` — list recent stock transactions
- `GET  /api/v1/call-logs` — list recent call-sheet records
