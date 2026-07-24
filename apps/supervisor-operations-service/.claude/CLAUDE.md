# supervisor-operations-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose

Supervisor field operations: meetings/training events and attendance, inventory
items and stock transactions, and call-sheet logs (ERD §4.7 "Supervisor Operations").

## What belongs here

Logic and data for this domain only.

## What must NEVER be added

Other services' concerns or tables. Talk to other services via API/events only.

## Data ownership

Owns its own `supervisor_events`, `event_attendance`, `inventory_items`,
`inventory_transactions`, and `call_logs` tables (see `prisma/schema.prisma`).
No cross-service joins — FKs to projects/supervisor_profiles/sakhi_profiles/
media_assets/users are plain scalar columns.

## Deployment

Own Docker image; deployed independently to ECS Fargate behind the API Gateway. Stateless.
