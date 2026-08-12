# arogya-backend

Nx monorepo of independently deployable Express microservices for the Arogya Sakhi
platform. Engineering standards live in [`.claude/CLAUDE.md`](./.claude/CLAUDE.md).

## Layout

```
apps/   16 microservices (each its own Dockerfile, deployed independently)
libs/   core · service-commons · api-contracts (shared, publishable)
```

## Prerequisites

- **Node 24.18.0** ("Krypton", Active LTS) — pinned in `.nvmrc`. With `nvm`:
  `nvm install && nvm use`.
- **npm 10+** (ships with Node 24).
- **Docker** for local Postgres + Redis.
  - macOS without Docker Desktop: `brew install colima docker docker-compose`,
    then `colima start` once. After that `docker compose` works normally.

## Getting started (clone → all services running)

```bash
nvm install && nvm use        # Node 24.18.0 from .nvmrc
npm install                   # installs deps AND generates all Prisma clients (postinstall)
cp .env.example .env          # local DB/Redis URLs (defaults match docker compose)
docker compose up -d          # start Postgres + Redis
npm run db:setup              # create each service's tables in the DB
npm run serve:all             # build + run all 16 services (ports 3000-3015)
```

Verify a service is up (e.g. beneficiary on 3001):

```bash
curl http://localhost:3001/api/v1/health/live
# -> {"success":true,"message":"OK","data":{"status":"ok"}}
```

**Why the extra DB steps:** each service owns its own Prisma schema
(`apps/<svc>/prisma/schema.prisma`) and generates an isolated client into
`node_modules/.prisma/client-<svc>`. `npm install` runs `db:generate` automatically
(postinstall); `db:setup` then pushes every schema to the shared `arogya` database.
Re-run `npm run db:generate` after changing any schema.

**Service ports:** 3000 api-gateway · 3001 beneficiary · 3002 auth · 3003 visit-form ·
3004 rules · 3005 risk-referral · 3006 closure-reopen · 3007 approval ·
3008 incentive-wages · 3009 notification-escalation · 3010 sync · 3011 media ·
3012 wrapper-api · 3013 audit · 3014 cms-content · 3015 reporting-etl.

## Common commands

```bash
npm run serve:all               # run all 16 services (ports 3000-3015)
npx nx serve <service>          # run a single service in watch mode
npm run db:generate             # regenerate all Prisma clients (after a schema change)
npm run db:setup                # push all schemas to the DB (dev-only, non-migrating)
npm run migrate                 # apply every service's migrations (prisma migrate deploy)
npx nx test <service>           # unit tests
npx nx affected -t lint test build   # only what changed
npx nx graph                    # dependency graph
```

## Migrations

`npm run migrate` runs `prisma migrate deploy` for every service (via
`tools/prisma-foreach.js`), applying each service's already-authored migration
files against its own schema namespace. It never generates or edits migrations
and never resets the DB — safe for CI/production.

**Migrations are append-only.** For any schema change:

1. Edit the service's `prisma/schema.prisma`.
2. Generate a NEW migration: `npx prisma migrate dev --name <desc> --schema apps/<svc>/prisma/schema.prisma`.
3. Apply everywhere with `npm run migrate`.

Never edit an already-committed migration file — Prisma tracks each by checksum,
so retroactive edits break `migrate deploy` on any environment where the
migration was already applied. Correct a mistake with a new follow-up migration
instead. (`db:setup`/`db:push` is a schemaless dev shortcut that bypasses
migration history — use `migrate` for anything that must be reproducible.)

## Adding a service

Clone the structure of `apps/beneficiary-service` (the reference service). Keep it
forklift-ready: no imports from other services, own DB tables, shared code only via
`libs/*`.
