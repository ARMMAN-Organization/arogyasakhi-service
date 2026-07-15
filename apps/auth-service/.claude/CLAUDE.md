# auth-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose

Authentication, JWT and refresh tokens, sessions, device registry. Also owns funder/project
master data (grouped here per the ERD's "Access, Project, and Geography" section).

## What belongs here

Logic and data for this domain only.

## What must NEVER be added

Other services' concerns or tables. Talk to other services via API/events only.

## Data ownership

Owns its own `sessions`-family tables and `funders`/`projects` master data (see
`prisma/schema.prisma`). No cross-service joins.

## Deployment

Own Docker image; deployed independently to ECS Fargate behind the API Gateway. Stateless.
