# beneficiary-service — service instructions

Follow the root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).
This file adds service-specific context.

## Purpose
The system of record for **who** a beneficiary is and their case lifecycle.

## Responsibilities
- Person-level encrypted PII (vault), beneficiary cases (mother/child), consent
  capture, status history, duplicate detection via non-reversible search tokens.

## What belongs here
- Beneficiary identity, case creation/updates, consent, duplicate detection.

## What must NEVER be added here
- Visit/form logic, risk evaluation, referral, incentive, notification — those are
  separate services. Do not read another service's tables.

## Dependencies on other repos/services
- `@armman/core`, `@armman/service-commons`, `@armman/api-contracts` (libs).
- Emits `beneficiary_registered` events (consumed by visit/reporting).
- Coordinates with Media (consent photos) and Sync (offline enrollment) via API/events only.

## Data ownership
- Owns `beneficiary_*` tables only (see `prisma/schema.prisma`). No cross-service joins.

## Deployment
- Built as its own Docker image from the monorepo root; deployed independently to
  ECS Fargate behind the API Gateway. Stateless; scales horizontally.
