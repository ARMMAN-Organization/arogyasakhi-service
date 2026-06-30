# api-gateway — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose
Single ingress: JWT validation, RBAC, rate limiting, request logging and routing.

## Note
Routing/proxy configuration to downstream services is added here; it owns no domain data.

## What must NEVER be added
Domain business logic that belongs to another service. Integrate via API/events only.

## Deployment
Own Docker image; deployed independently to ECS Fargate. Stateless.
