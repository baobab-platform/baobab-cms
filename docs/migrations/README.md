# Schema Governance & Migrations

Implements ADR-0019.

## The rule

Production schema is code (`payload.config.ts` + `src/collections/*.ts`).
The only path to a persisted schema change is a migration in
`migrations/`. There is no manual production database editing, ever.

## Day-to-day workflow

```bash
# 1. Change collection field(s) in src/collections/*.ts
# 2. Generate a migration from the diff against a real database:
DATABASE_URL=postgresql://payload:payload@localhost:5432/payload \
PAYLOAD_SECRET=<any value for local generation> \
npm run db:generate -- <short_description>

# 3. Known Payload 3.88 generator quirk — fix the emitted import line.
#    This repo's tsconfig sets verbatimModuleSyntax: true, but the
#    generator emits:
#      import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'
#    which fails at runtime ("does not provide an export named
#    'MigrateDownArgs'") because those two names are types. Change it to:
#      import type { MigrateDownArgs, MigrateUpArgs } from '@payloadcms/db-postgres'
#      import { sql } from '@payloadcms/db-postgres'
#    This is a one-line fix, required after every `db:generate` run,
#    until this is fixed upstream or this repo's generator template is
#    overridden.

# 4. Apply it locally and confirm it's correct:
npm run db:migrate

# 5. Commit the migration file alongside the schema change in the same PR.
```

## Before your first migration on a fresh database

Payload's postgres adapter (`schemaName: 'payload'` in
`payload.config.ts`) does not create that schema itself — it must already
exist:

```sql
CREATE SCHEMA IF NOT EXISTS payload AUTHORIZATION payload;
```

`docker-compose.yml`'s `postgres` service does this automatically via
`docker/postgres/init/01-create-schema.sql`. CI's migration-gate job does
it as an explicit step. A fresh manual `psql` setup needs to do it too.

## Expand-and-contract

Prefer additive changes across two PRs over a destructive one-step
change: add the new field, backfill/dual-write if needed, migrate readers
to it, then remove the old field in a later, separate migration
(ADR-0019 §21-22). This is why, in this change set, legacy fields like
`Users.tenantID` (capital `ID`, free text) were kept side-by-side with the
new canonical `Users.tenantId` rather than renamed in place.

## Tenant-safety testing (ADR-0019 §84, CT-001–CT-004)

Every migration that touches existing data (not just the initial
empty-database schema) should be tested against a representative fixture
covering:

- multiple tenants with colliding attribute values (same slug, same
  filename, same market code across two different tenants);
- at least one record in each publication state;
- at least one localized and one non-localized record.

Verify after migrating: every record's `tenant` field is unchanged, no
record moved between tenants, and relationships/canonical ids survived.
Migration integrity is now checked automatically (registry, up/down handlers and snapshots).
That is **not** a replacement for the multi-tenant data-preservation fixture tests above;
those tests must accompany migrations that rewrite existing rows.

## CI gate

`.github/workflows/ci.yml`'s `migration-check` job spins up a real
Postgres service container, creates the `payload` schema, and runs
`npm run db:migrate` against every committed migration, followed by
`npm run reconcile`. A migration that doesn't apply cleanly, or that
schema-generation didn't actually produce, fails CI (ADR-0019 §96,
"deployment gate").

## Deterministic migration inventory check

Run `node scripts/check-migrations.mjs` before DB migration execution. It rejects missing
schema snapshots, missing handlers, duplicate names, out-of-order registrations, and
unregistered or orphaned migration files. CI runs this *before* opening a PostgreSQL
connection. The separate live PostgreSQL 17 migration gate still verifies actual execution.
