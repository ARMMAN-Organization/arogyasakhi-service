# reporting-etl-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose

Reporting APIs over ClickHouse and ETL orchestration (Airflow).

## Note

Reads the ClickHouse warehouse; ETL DAGs run via Airflow. The ClickHouse
warehouse objects (dim__, fact__, linelist views) are NOT modeled in Prisma.

## Data ownership

Owns two operational Postgres tables — `etl_runs` (Airflow run metadata) and
`report_exports` (report download/export audit) — via Prisma (see
`prisma/schema.prisma`). No cross-service joins; user FKs are plain scalars.

## What must NEVER be added

Domain business logic that belongs to another service. Integrate via API/events only.

## Deployment

Own Docker image; deployed independently to ECS Fargate. Stateless.
