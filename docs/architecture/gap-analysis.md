# Baobab Content Engine — Phase 0 Gap Analysis

> **Historical snapshot.** This is the Phase 0 inventory taken before the ADR-0011 to ADR-0020 refactoring. Its "state" tables
> (Payload version, empty migrations directory, no storage, local-only auth) describe the repository at that point, not today.
> Current state: `docs/architecture/implementation-report.md`, `docs/architecture/adr-conformance.md` and `contracts.lock.yaml`.

This document is the Phase 0 inventory required before refactoring `baobab-platform/baobab-cms`
against ADR-0011 through ADR-0020. It records what existed before this change set,
maps it against ADR requirements, and defines the gap this implementation closes.

## 1. Inventory at Start

| Concern | State |
|---|---|
| Payload version | `payload@^3.0.0`, `@payloadcms/db-postgres@^3.0.0`, `@payloadcms/richtext-lexical@^3.88.0` |
| Package manager | npm (`package-lock.json` present) |
| TypeScript | strict, NodeNext, `@/*` and `@nabhold/shared` path aliases already declared but unused |
| DB adapter | Postgres, `schemaName: payload`, `idType: uuid`, migrations dir `./migrations` (empty) |
| Storage | none — uploads not yet enabled on any collection |
| Auth | `Users` collection with Payload local auth only; `tenantID`/`organisationID` free-text fields, no validation |
| Collections | `Users`, `Tenants`, `Organisations`, `Regions`, `Pages` — flat, no scope model, no canonical identity |
| Hooks | `publishEntityEvent` (afterChange/afterDelete on every collection) — fires a synchronous AMQP publish from inside the request hook |
| Events | `RabbitMqEventDispatcher` / `KafkaCompatibleEventDispatcher` — ad hoc envelope (`SharedEventEnvelope`), no outbox, no retry, no idempotency key, no canonical entity id |
| Access control | none — every collection uses Payload defaults (fully open) |
| Admin UI | disabled (`admin.disable: true`) |
| CI/CD | none — no `.github/workflows` |
| Tests | none |
| DevContainer | present, builds `baobab-dev` workspace image, runs `baobab-verify --contract` |
| Docs | ADR-0011..0020 only; no implementation docs |

## 2. Gap Matrix

| # | ADR requirement | Current state | Gap | Risk | Recommended implementation | Affected modules |
|---|---|---|---|---|---|---|
| 1 | Canonical Baobab context resolved before every operation (ADR-0011 §4.3, ADR-0012 §3) | No context concept; hooks read ad hoc fields off `req.user`/`doc` with silent fallbacks (`'tenant-root'`) | No fail-closed context resolution | High — silent cross-tenant default | `src/baobab/context` | new |
| 2 | Tenant isolation enforced centrally, not per-query (ADR-0012 §15-18) | No `access` functions on any collection | Any authenticated (or unauthenticated, since admin disabled ≠ API disabled) request can read/write any tenant's rows | Critical | `src/baobab/tenancy` + collection `access` wiring | Tenants, Organisations, Regions, Pages, Users |
| 3 | Legal entity ≠ tenant, digital estate / market / locale as first-class dimensions (ADR-0012 §4, ADR-0014) | `Organisations` conflates legal entity; no `DigitalEstate`/`Market` collections; `Regions` conflates market/region | Missing dimensions | High | Add `DigitalEstates`, `Markets`; keep `Regions` as physical/legacy dimension, documented | new collections |
| 4 | Canonical identity distinct from Payload ID (ADR-0013) | None — Payload UUID is the only identifier | No cross-engine stability | High | `src/baobab/identity` (`canonicalEntityId` field + helpers) | Pages, ProductContent, Media |
| 5 | Canonical mapping via Control Plane resolver, not direct DB (ADR-0013 §41, §73) | No mapping layer at all | N/A yet | Medium | `src/baobab/mappings` client interface + local non-authoritative projection collection | new |
| 6 | Deterministic content resolution / inheritance (ADR-0014) | None — Pages has no scope/specificity model | Only exact Payload query available | Medium | `src/baobab/content-resolution` | Pages |
| 7 | Payload/Medusa product split authority (ADR-0015) | No `ProductContent` collection | N/A | Medium | `ProductContent` collection + commerce projection | new |
| 8 | Media as governed resource, external object storage, access classes (ADR-0016) | No `Media` collection, no storage adapter | Media entirely unimplemented | High | `Media` collection + S3-compatible adapter + `src/baobab/media` | new |
| 9 | Federated identity, context-bound authorization, default-deny (ADR-0017) | `Users.roles` is a flat multi-select with no context binding; no access functions | No authorization model | Critical | `src/baobab/authorization` + `src/baobab/identity` actor projection | Users |
| 10 | Canonical events + transactional outbox, at-least-once, idempotent (ADR-0018) | Direct synchronous AMQP publish inside `afterChange`/`afterDelete`; hook name used as event name (`payload.pages.update`) — violates "hooks are not canonical event contracts"; no outbox, no retry, no dedup | Editorial writes depend on RabbitMQ availability; event loss on publish failure (caught & swallowed) | Critical | `Outbox` collection + dispatcher worker + canonical envelope builder | events/hooks rewritten |
| 11 | Schema governed as code + migration discipline (ADR-0019) | `migrations/` dir empty, no migration generated for existing collections, no CI gate | Schema drift undetectable | Medium | `db:generate`/`db:migrate` scripts already present; add CI migration-check job | CI |
| 12 | Health/readiness, observability, reconciliation, caching discipline (ADR-0020) | None | No operational surface | Medium | `src/baobab/observability` (health endpoints), `scripts/reconciliation/*` | new |
| 13 | No hard-coded tenant/market branches (ADR-0011 §47-48) | None present currently | N/A | Low | Keep enforcing via review; nothing to fix | — |
| 14 | CI/CD, SHA-pinned actions, lint/typecheck/test gates | None | No CI at all | High (governance) | `.github/workflows/ci.yml` | new |
| 15 | Tests (unit/integration/negative-tenancy/contract) | None | No coverage | Critical | vitest + negative tenancy suite | new |

## 3. Scope of This Change Set

Given the size of ADR-0011–0020 (~17k lines of normative text), this change set
implements Phases 1–7 with real depth on the load-bearing architectural boundaries
(context, tenancy, canonical identity/mapping, content resolution, authorization,
media, events/outbox) and a lighter but functional treatment of reconciliation,
observability and CI. It deliberately does **not**:

- stand up a real Control Plane, Medusa, or identity-provider integration (none
  exist in this repo or org yet) — those integration points are implemented as
  explicit, typed **client interfaces** with an in-memory/local reference
  implementation, so a real HTTP client can be substituted without touching
  collection or hook code;
- introduce Kafka, OpenSearch, a service mesh, or a dedicated DAM/workflow engine
  (ADR explicitly says not to, absent a justified requirement);
- fork or patch Payload internals.

See `docs/architecture/adr-conformance.md` for the full acceptance-criteria matrix
and `docs/architecture/implementation-report.md` for what is implemented, deferred,
and the reasoning behind each call.
