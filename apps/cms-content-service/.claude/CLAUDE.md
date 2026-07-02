# cms-content-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose
Health-education content and versioned offline content packs (wraps Strapi).

## Note
Backed by Strapi; this service exposes content packs to clients via the API.

## What must NEVER be added
Domain business logic that belongs to another service. Integrate via API/events only.

## Deployment
Own Docker image; deployed independently to ECS Fargate. Stateless.
