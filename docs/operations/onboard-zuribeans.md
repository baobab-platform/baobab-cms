# Onboard Zuribeans (Content Engine)

> **Verified**: this runbook and its seed script have been executed
> end-to-end against a real PostgreSQL 16 instance (idempotency confirmed
> by a second run — every step correctly `[skip]`ped with the same IDs),
> followed by `npm run reconcile` (zero missing-tenant anomalies) and the
> tenancy isolation suite (`src/baobab/tenancy/access.test.ts`,
> `src/baobab/context/resolve.test.ts` — 22/22 passing). This was a local
> sandbox database, not a shared dev/staging environment — none exists yet
> for this greenfield project, so this is the first real execution of
> this procedure anywhere. The two post-seed operator steps that need a
> browser session against a running Admin UI (generating the service
> user's API key; rotating a default password if one was used) were not
> exercised here and remain genuinely manual.

---

## Purpose

Bring the **Zuribeans** B2B digital estate (`nabhold/zuribeans`) onto the Baobab
Content Engine while the **Control Plane is not yet ready** to issue
authoritative tenant / legal-entity / digital-estate / market records.

This runbook documents the **operator procedure**. Automation is the companion
script `scripts/onboarding/zuribeans.ts`, which seeds **local, non-authoritative
projections** only so editorial work and estate composition can start without
inventing a second platform authority.

When Control Plane becomes available, projections are reconciled — they are
not the long-term source of truth.

---

## Architecture rationale

| Concern | Decision | Why |
|--------|----------|-----|
| Authority | CMS holds projections (`isProjection: true` on tenants) | Control Plane owns tenant/estate/market (ADR-0012); CP offline → local projections |
| Default market | `zuribeans_za` (South Africa) | Product decision for Zuribeans |
| Domains | `zuribeans.co.za`, `zuribeans.co.ug` (placeholders) | Domains are routing only, never identity (ADR-0012 §25) |
| Product stubs | Placeholder `canonicalProductId` values | Must not invent Medusa IDs; map later via CP (ADR-0015) |
| Service identity | Interim Payload API key + `serviceIdentity` user | IAM workload pattern exists (Gate IAM-4); CMS OIDC still deferred (Gate IAM-5 §2b) |
| No hard-coded branches | All behaviour is data-driven by `code` / context | ADR-0011 — no `if (tenant === 'zuribeans')` |

Related estate repo: `nabhold/zuribeans`  
Related IAM: `nabhold/baobab-iam` (Gate IAM-6 Zuribeans B2B; Gate IAM-4 workload identity)

---

## Prerequisites

1. `nabhold/baobab-cms` checked out, dependencies installed (`npm ci`).
2. Postgres reachable (`DATABASE_URL`); migrations applied (`npm run db:migrate`).
3. `PAYLOAD_SECRET` set (see `.env.example`).
4. At least one existing **platform administrator** is *not* required for the
   script — it uses `SYSTEM_ACTOR` + `overrideAccess` (see
   `src/baobab/context/system-actor.ts`).

Optional env for the seed:

```bash
export ZURIBEANS_ADMIN_PASSWORD='use-a-strong-password'
export ZURIBEANS_SVC_PASSWORD='use-a-strong-password'
```

Defaults are `change-me` if unset — **rotate immediately** after first run.

---

## What the seed creates

Order is fixed (foreign-key / ownership dependencies):

1. **Tenant** — code `zuribeans`, isolation `shared-logical`, locale `en`
2. **Organisation** (legal entity) — code `zuribeans`
3. **Markets** — `zuribeans_za` (ZAR, default), `zuribeans_ug` (UGX)
4. **Digital estate** — code `zuribeans`, default market ZA, domain placeholders
5. **Users**
   - `content-admin@zuribeans.local` — ContentAdministrator + Publisher
   - `svc-zuribeans-content@zuribeans.local` — serviceIdentity, delivery capability
6. **Page** — `home` / contentKey `home`, published, scoped to estate + ZA + `en`
7. **ProductContent** (DRAFT stubs)
   - `zuribeans.product.sample-beans`
   - `zuribeans.product.sample-roast`
   - `zuribeans.product.sample-pack`

The script is **idempotent**: re-runs skip entities that already exist by
`code` / `email` / scoped `slug`.

---

## Run the seed

From the **baobab-cms repository root**:

```bash
# Ensure DB is up and migrated
npm run db:migrate

# Seed Zuribeans projections + bootstrap content
npx tsx scripts/onboarding/zuribeans.ts
```

Expected console output includes `[create]` / `[skip]` lines and a final JSON
summary of IDs (tenant, org, estate, markets, user emails).

**Do not commit** passwords or generated API keys to git.

---

## Post-seed operator steps

### 1. Service API key (interim machine identity)

1. Sign in to Payload Admin as a platform admin (or create one if this is a
   fresh environment).
2. Open **Users** → `svc-zuribeans-content@zuribeans.local`.
3. Enable **API Key** and copy the key into the Zuribeans estate secret store
   (e.g. env / infrastructure secrets — not the estate git repo).
4. Estate → CMS calls should send that key and the Baobab context dimensions
   (tenant / digital estate / market / locale) as agreed by the delivery
   contract.

When `baobab-cms` OIDC is wired, retire this API key in favour of a Keycloak
workload client (ADR-0007 / Gate IAM-4).

### 2. Rotate human passwords

Change `content-admin@zuribeans.local` password in Admin if the seed used the
default `change-me`.

### 3. Negative tenancy smoke check

Confirm isolation (ADR-0012):

- As a *different* tenant’s editor, home / product-content for Zuribeans must
  not be readable or writable.
- As Zuribeans content-admin, only Zuribeans-scoped records appear.

Automated coverage for the general pattern lives in
`src/baobab/tenancy/access.test.ts` and `src/baobab/context/resolve.test.ts`.

### 4. Estate composition

Zuribeans should resolve content with explicit context, for example:

| Dimension | Value |
|-----------|--------|
| tenant | `zuribeans` (or CMS projection id / future CP id) |
| digitalEstate | `zuribeans` |
| market | `zuribeans_za` (default) or `zuribeans_ug` |
| locale | `en` |

First consumers:

1. Published page by `contentKey` / slug within scope  
2. ProductContent by `canonicalProductId` (compose with Medusa commerce)  
3. Media by `canonicalMediaId` when assets are added  

Do **not** re-implement tenancy or inheritance inside the estate.

### 5. Reconciliation

```bash
npm run reconcile
```

Should report no missing-tenant anomalies for the new rows. After bulk
imports or CP sync, re-run and inspect stale mapping projections / outbox
backlog (`docs/operations/runbooks.md`).

---

## When Control Plane becomes ready

1. Register tenant, legal entity, digital estate, and markets in CP with the
   **same stable codes** (`zuribeans`, `zuribeans_za`, `zuribeans_ug`).
2. Sync projections into CMS (events or controlled refresh); set
   `lastSyncedAt` and keep `isProjection: true` until cutover policy says
   otherwise.
3. Replace interim service user with workload identity from `baobab-iam`.
4. Map real Medusa products to ProductContent via Control Plane mappings —
   never by SKU/slug alone (ADR-0015). Update or retire the
   `zuribeans.product.*` placeholders.
5. Update digital-estate `domains` when final hostnames are decided.

Canonical entity IDs already assigned by the CMS **must remain stable**
across that migration (ADR-0013).

---

## Explicit non-goals

- Supplier master data in Payload — stays in Zuribeans’ own DB / future ERP  
- Commerce truth (price, SKU, inventory) in CMS — stays in Medusa  
- Hard-coded tenant branches in application code  
- New collections solely for this onboard (Pages + ProductContent + Media suffice)

---

## File map

| Path in `nabhold/baobab-cms` | Role |
|------------------------------|------|
| `scripts/onboarding/zuribeans.ts` | Idempotent seed (this runbook’s automation) |
| `docs/operations/onboard-zuribeans.md` | This document |
| `docs/operations/runbooks.md` | Deploy, outbox, reconcile, backup |
| `src/baobab/context/system-actor.ts` | Synthetic platform actor used by the seed |
| `src/collections/{Tenants,Organisations,Markets,DigitalEstates,Pages,ProductContent,Users}.ts` | Schema the seed targets |

---

## Rollback

There is no automated “undo seed” script. To remove a failed partial seed in a
**non-production** environment:

1. Delete created pages / product-content / users for Zuribeans in Admin (or
   Local API with platform admin).
2. Delete markets, digital estate, organisation, then tenant (respect FK
   order).

In production, prefer expand-and-contract: mark projections inactive and
reconcile rather than hard-delete after real content exists.
