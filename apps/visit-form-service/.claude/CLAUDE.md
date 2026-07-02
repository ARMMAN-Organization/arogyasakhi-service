# visit-form-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose
Visit schedules and instances, form definitions and submissions.

## What belongs here
Logic and data for this domain only.

## What must NEVER be added
Other services' concerns or tables. Talk to other services via API/events only.

## Data ownership
Owns its own `visit_instances`-family tables (see `prisma/schema.prisma`). No cross-service joins.

## Deployment
Own Docker image; deployed independently to ECS Fargate behind the API Gateway. Stateless.
