# Operations Runbooks

Implements ADR-0020. These runbooks describe the current, real deployment
surface (one region, one shared Payload runtime, Postgres +
S3-compatible storage + RabbitMQ). Multi-region/dedicated-instance
runbooks are not written yet — no such deployment exists (see
`docs/architecture/implementation-report.md`).

## Deploy

1. CI (`.github/workflows/ci.yml`) must be green on the commit being
   deployed: lint, typecheck, tests, `next build`, and the migration gate.
2. Build the container image: `docker build -t baobab-cms:<tag> .`
   (produces a Next.js standalone runtime — see `Dockerfile`).
3. Apply pending migrations **before** rolling the new image out, using
   the same image's build stage or a CI job with the full toolchain
   (the runtime image itself does not carry the CLI/migration
   toolchain — see the Dockerfile's comment):
   ```bash
   DATABASE_URL=... PAYLOAD_SECRET=... npm run db:migrate
   ```
4. Roll the new container image out (rolling/blue-green per your
   infrastructure — this repo does not prescribe one). Expand-and-contract
   migrations (see `docs/migrations/README.md`) are what make old and new
   instances able to coexist during a rolling deploy.
5. Confirm `/api/health/ready` returns `200` with `status: "healthy"` (or
   `"degraded"` with only non-critical dependencies affected) before
   considering the deploy complete.

## Rollback

- **Application rollback** (redeploy the previous image) is safe whenever
  the previous image's code is compatible with the *current* database
  schema — which expand-and-contract migrations guarantee for one
  migration generation back. It is not safe across a contracting
  migration (one that dropped a column the old code still reads) — check
  the migration's own commit message/description for whether it's
  reversible.
- **Data rollback** (`payload migrate:down`) is a distinct, higher-risk
  operation — confirm the specific migration's `down()` function actually
  reverses the change (Payload generates one, but it is not automatically
  safe for a migration that has already run against live data) before
  running it against anything but a disposable environment.

## Outbox operations

- Check backlog: `npm run reconcile` (reports
  `outbox.backlog: { pending, retrying, deadLettered }`).
- Drain manually: `npm run outbox:dispatch` (idempotent — safe to run
  concurrently with a scheduled run; duplicate delivery is tolerated by
  design, ADR-0018 §38-41).
- A non-zero `deadLettered` count needs human review — those events
  exhausted `DEFAULT_RETRY_POLICY.maxAttempts` (8 attempts, exponential
  backoff up to 5 minutes). Inspect the `outbox` collection's `lastError`
  field for the row (Payload Admin, or `payload.find({ collection:
  'outbox', where: { status: { equals: 'FAILED_TERMINAL' } } })`).

## Reconciliation

```bash
npm run reconcile
```

Prints a JSON report covering: tenant-owned collections with a record
missing both a `tenant` and `PLATFORM` scope, stale `mapping-projections`
rows, and the outbox backlog summary. Run this after any bulk
import/migration/recovery event (ADR-0020 §111-114), and on a schedule in
steady state. It currently does **not** check media
object-storage-vs-record consistency — see `docs/media/README.md`.

## Backup & restore

This repository does not implement backup tooling directly (that's
infrastructure, per ADR-0020 §156, owned by `baobab-platform/infrastructure` or
equivalent) but a complete backup **must** cover, per ADR-0020 §81-84:

1. PostgreSQL data (the `payload` schema) — standard `pg_dump`/managed
   snapshot tooling.
2. Object storage (the S3-compatible media bucket) — provider-native
   backup/versioning.
3. The `outbox` and `audit-logs` collections are part of (1) — no special
   handling, but confirm your backup includes them (they're easy to
   accidentally exclude if someone hand-rolls a "just the content
   tables" backup).

A database backup alone is **not** a complete restore story — a restored
database with no matching object-storage state will show media records
whose objects are 404. There is no automated restore-validation script in
this repository yet; validate manually against `docs/media/README.md`'s
reconciliation predicates after any real restore.

## Regional failover / tenant migration

Not applicable — this deployment has one region and one shared engine
instance. `BaobabContext.engineInstanceId`/`isolationProfile` exist and
are threaded through the codebase so that a future dedicated-instance or
multi-region topology does not require a content-model change (ADR-0012
§85, ADR-0020 §140-146) — but there's no second instance yet for a
runbook to describe moving a tenant to.

## Credential rotation

`PAYLOAD_SECRET`, `PAYLOAD_JWT_SECRET`, `DATABASE_URL` credentials,
`S3_ACCESS_KEY_ID`/`S3_SECRET_ACCESS_KEY`, and `RABBITMQ_URL` credentials
are all environment-injected (`.env.example` documents every variable) —
none are stored in content records or source control. Rotating any of
them is a deployment-environment change, not a code or content change.
