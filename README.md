# baobab-cms — Baobab Content Engine

Payload CMS, extended into the Baobab Platform's multi-tenant Content
Engine per `docs/adr/ADR-0011` through `ADR-0020`.

## Documentation

- **Start here:** `docs/architecture/overview.md` — how the ADRs map to
  this codebase's layering, request flow, and modules.
- `docs/architecture/adr-conformance.md` — acceptance-criteria matrix.
- `docs/architecture/gap-analysis.md` — Phase 0 inventory this change set
  was built from (a historical snapshot, not the current state).
- `docs/architecture/implementation-report.md` — what's implemented,
  partial, deferred, and why; what was actually verified vs. asserted.
- Topic guides: `docs/tenancy`, `docs/identity`, `docs/authorization`,
  `docs/mappings`, `docs/content-resolution`, `docs/product-content`,
  `docs/media`, `docs/events`, `docs/migrations`, `docs/collections`.
- `docs/operations/runbooks.md` — deploy, rollback, outbox, reconciliation,
  backup/restore.
- Nabhold corporate estate (`content.entry.resolve` provider): route and
  configuration in `docs/content-resolution/provider-route.md`, onboarding in
  `docs/operations/onboard-nabhold.md`, content model in
  `docs/collections/corporate-singletons.md`, upstream status in
  `docs/operations/nabhold-upstream-dependencies.json`, and the decision record
  `docs/adr/ADR-0021_*` (Proposed). Nothing here activates the estate in any
  environment.

## Local development

Prereqs: Node 22 (the version CI and the container image use), Docker (for Postgres/RabbitMQ/MinIO), or point
`DATABASE_URL`/`RABBITMQ_URL`/`S3_*` at your own instances.

```bash
cp .env.example .env
docker compose up -d postgres rabbitmq minio minio-init
npm ci
npm run db:migrate
npm run dev          # Next.js dev server hosting Payload Admin + API
```

Admin UI: http://localhost:3000/admin
REST/GraphQL: http://localhost:3000/api, http://localhost:3000/api/graphql-playground
Health: http://localhost:3000/api/health/live, http://localhost:3000/api/health/ready

Or use the devcontainer (`.devcontainer/`) — it starts Postgres, RabbitMQ
and MinIO for you and runs `npm run db:migrate` on creation.

## Scripts

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev/build/serve (hosts Payload Admin + REST + GraphQL) |
| `npm run db:generate -- <name>` | Generate a migration from the current schema diff |
| `npm run db:migrate` | Apply pending migrations |
| `npm run generate:types` | Regenerate `src/payload-types.ts` |
| `npm run outbox:dispatch` | Drain one batch of the transactional outbox |
| `npm run reconcile` | Print a reconciliation report |
| `npm run typecheck` / `lint` / `test` | CI checks, runnable locally |

## Architecture in one sentence

Payload owns editorial content and its lifecycle; canonical tenant/estate
/market/locale context and cross-engine identity are modelled as explicit,
centrally-enforced concerns (`src/baobab/`) rather than left to individual
collections to reimplement — see `docs/architecture/overview.md`.
