# wrapper-api-service — service instructions

Follow root standards in [`../../.claude/CLAUDE.md`](../../.claude/CLAUDE.md).

## Purpose
Facade over external channels (WhatsApp/TURN, IVR/Hungama, LLM/ArtPark).

## Note
Provider SDKs/adapters live here so no other service embeds them.

## What must NEVER be added
Domain business logic that belongs to another service. Integrate via API/events only.

## Deployment
Own Docker image; deployed independently to ECS Fargate. Stateless.
