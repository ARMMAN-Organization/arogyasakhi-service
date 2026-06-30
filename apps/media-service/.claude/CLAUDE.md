# media-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose
Signed-URL media uploads and metadata tracking.

## What belongs here
Logic and data for this domain only.

## What must NEVER be added
Other services' concerns or tables. Talk to other services via API/events only.

## Data ownership
Owns its own `media_assets`-family tables (see `prisma/schema.prisma`). No cross-service joins.

## Deployment
Own Docker image; deployed independently to ECS Fargate behind the API Gateway. Stateless.
