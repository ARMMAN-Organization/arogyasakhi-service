# reporting-etl-service

Reporting APIs over ClickHouse and ETL orchestration (Airflow). See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

> Reads the ClickHouse warehouse; ETL DAGs run via Airflow. Two operational
> tables — `etl_runs` and `report_exports` — live in Postgres via Prisma.

## Run

```bash
cp .env.example .env
npx prisma generate --schema prisma/schema.prisma
npx nx serve reporting-etl-service   # http://localhost:3015/api/v1
```

Health: `/api/v1/health/live`, `/api/v1/health/ready` (checks DB connectivity).
