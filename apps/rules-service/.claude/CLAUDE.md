# rules-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose
Central GoRules execution and versioned rule packs.

## What belongs here
Logic and data for this domain only.

## What must NEVER be added
Other services' concerns or tables. Talk to other services via API/events only.

## Data ownership
Owns its own `rule_sets`-family tables (see `prisma/schema.prisma`). No cross-service joins.

## Deployment
Own Docker image; deployed independently to ECS Fargate behind the API Gateway. Stateless.
