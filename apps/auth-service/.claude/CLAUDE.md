# auth-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose

Authentication, JWT and refresh tokens, sessions, device registry. Also owns
funder/project/geography master data (grouped here per the ERD's "Access, Project,
and Geography" section).

## What belongs here

Logic and data for this domain only.

## What must NEVER be added

Other services' concerns or tables. Talk to other services via API/events only.

## Data ownership

Owns its own `sessions`-family tables and `funders`/`projects`/`geography_units`
master data (see `prisma/schema.prisma`). No cross-service joins. `geography_units`
is scoped to the SRS's 7-level hierarchy only (State/District/Block/PHC/Sub-centre/
Village/Pada) — no Taluka or Panchayat.

## Deployment

Own Docker image; deployed independently to ECS Fargate behind the API Gateway. Stateless.
