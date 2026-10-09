# Onboarding Nabhold Group Africa into the CMS (local projection)

Script: `scripts/onboarding/nabhold.ts`. Decision logic: `src/baobab/onboarding/nabhold.ts`.
Status: implemented in code and exercised against a scratch PostgreSQL 16. **Not production-activated.**

## Authority

The Control Plane owns tenant, legal entity, market, digital estate, entitlement and binding. This script writes
non-authoritative local projections (`isProjection: true`, provenance `LOCAL_PROJECTION`, reconciliation `UNRECONCILED`).
It refuses to write in production and whenever `--projection-mode local` is not given.

## Modes

| Command | Effect |
|---|---|
| `npx tsx scripts/onboarding/nabhold.ts` | Dry-run (default). Prints the plan, writes nothing. |
| `... --verify` | Read-only. Exit 1 unless every record exists and matches. |
| `... --apply --projection-mode local` | Creates what is missing. Development and test only. |
| `--domain <host>` (repeatable) | Binds an approved hostname. None are bound by default. |

Environment is production unless `BAOBAB_ENVIRONMENT` is one of development, dev, test, local, ci, or `NODE_ENV` is development or test.

## What it creates

1. Tenant `nabhold` (projection).
2. Organisation `nabhold` with `canonicalLegalEntityId = NABHOLD` (the Shared first-party reference; supplied, not minted).
3. Market `nabhold_za`: ZA only, ZAR, `en-ZA`.
4. Digital estate `nabhold-corporate`, no domains unless `--domain` is passed.
5. One delivery-only workload identity (`content.delivery`, VIEWER, not an administrator) with a random password that is
   generated per run, never printed, never stored elsewhere. It authenticates by API key or workload token.

It creates no human account and no content. Editors arrive through IAM single sign-on; production editorial login stays
blocked until IAM federation is proven.

## Behaviour guarantees

- Lookup by stable key, then create; re-running creates nothing.
- Mismatches (duplicate, wrong tenant, market wider than ZA, over-privileged workload identity) are reported as blockers
  and never auto-repaired or overwritten.
- No registration number, tax reference, VAT number or address is written to the CMS.

## Legal-name discrepancy

Shared's first-party registry currently names the entity "Nabhold Group Africa". The CIPC record reads
"NABHOLD GROUP AFRICA (Pty) Ltd". Shared PR #252 (draft) carries the CIPC facts. The CMS uses the registry name and does
not decide which is canonical; it is not a legal registry. Reconcile after #252 is accepted.

## Rollback

Projection rows can be deleted by an administrator; nothing else references them yet. No schema change is involved.

## Verified

Against local PostgreSQL 16 after `payload migrate`: dry-run plans 5 creates; apply creates them; second apply creates
none; `--verify` exits 0; production apply is refused with exit 1.

## Starter content (CMS-NAB-06)

`scripts/onboarding/nabhold-content.ts` (same `--dry-run` / `--verify` / `--apply --projection-mode local` modes). Run it after
`nabhold.ts`. It creates five DRAFT records for the Nabhold estate and locale `en-ZA`: `home` (a `pages` record), and
`navigation`, `footer`, `site-settings`, `group-profile` (`site-configurations`).

- Nothing is published. A record that already exists in any state is left exactly as it is, so editor work is never overwritten.
- Text is limited to the display name and links to routes the estate has (`/about/group`, `/portfolio`, `/sectors`, `/insights`).
  The group profile is a one-line placeholder saying the page awaits approved content. No registration, tax, address, ownership,
  history or financial statement is written.
- Refuses production and runs only with an explicit projection mode. A duplicate is reported, not resolved.
- Verified on PostgreSQL 16: dry-run plans 5, apply creates 5, a second apply creates none, `--verify` passes, and all five resolve
  as DRAFT through `content.entry.resolve` in preview and as `NONE` in normal mode.
- Migrations for this step: `20261009_073426_drop_singleton_fields` (also adds the optional home columns on `pages`) and
  `20261009_073430_add_estate_shaped_fields`; up/down/up verified. They replace the field layout from CMS-NAB-03, which had not been
  released.
