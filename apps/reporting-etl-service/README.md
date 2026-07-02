# reporting-etl-service

Reporting APIs over ClickHouse and ETL orchestration (Airflow). See root [`.claude/CLAUDE.md`](../../.claude/CLAUDE.md) for standards.

> Reads the ClickHouse warehouse; ETL DAGs run via Airflow, not Prisma/Postgres.

## Run
```bash
cp .env.example .env
npx nx serve reporting-etl-service   # http://localhost:3015/api/v1
```
Health: `/api/v1/health/live`, `/api/v1/health/ready`.
