# reporting-etl-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose
Reporting APIs over ClickHouse and ETL orchestration (Airflow).

## Note
Reads the ClickHouse warehouse; ETL DAGs run via Airflow, not Prisma/Postgres.

## What must NEVER be added
Domain business logic that belongs to another service. Integrate via API/events only.

## Deployment
Own Docker image; deployed independently to ECS Fargate. Stateless.
