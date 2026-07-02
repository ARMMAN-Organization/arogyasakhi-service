# notification-escalation-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose
Event-driven notifications and escalations.

## What belongs here
Logic and data for this domain only.

## What must NEVER be added
Other services' concerns or tables. Talk to other services via API/events only.

## Data ownership
Owns its own `notifications`-family tables (see `prisma/schema.prisma`). No cross-service joins.

## Deployment
Own Docker image; deployed independently to ECS Fargate behind the API Gateway. Stateless.
