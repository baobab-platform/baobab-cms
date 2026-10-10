# Baobab Content Engine — Architecture Overview

This document explains how `baobab-platform/baobab-cms` realises ADR-0011 through
ADR-0020. It is implementation documentation, not a restatement of the
ADRs — read the ADRs in `docs/adr/` for the normative decisions; this
explains *how* the code satisfies them.

## 1. Layering

```text
payload.config.ts                 ← composition root: collections, plugins, endpoints
src/collections/*.ts               ← Payload collection configs (thin: fields + wiring)
src/baobab/                        ← framework-light Baobab domain logic, reusable across collections
├── context/          ADR-0012 §3-8     — canonical BaobabContext resolution, fail-closed
├── tenancy/           ADR-0012          — scope model, access-control factories, tenant field hooks
├── identity/          ADR-0013          — canonical entity id issuance/field
├── mappings/           ADR-0013          — ExternalReference/Mapping types, resolver interface
├── content-resolution/ ADR-0014          — deterministic scope/specificity/inheritance/fallback resolver
├── authorization/      ADR-0017          — roles, permissions, default-deny evaluator, capabilities
├── media/              ADR-0016          — upload policy, access classes, storage-key partitioning
├── events/             ADR-0018          — canonical event envelope + outbox-only publication hook
├── outbox/             ADR-0018          — transactional outbox enqueue + dispatcher + retry policy
├── webhooks/            ADR-0018          — HMAC signing, SSRF-guarded delivery
├── audit/               ADR-0017 §79-82  — audit record writer
├── observability/       ADR-0020 §52-56  — health/readiness endpoints
├── reconciliation/      ADR-0012/13/16/18/20 — pure detection predicates
└── util/                                  — small structural helpers (e.g. relationship-id extraction)
scripts/
├── outbox/dispatch.ts               ← drains the outbox once (cron/CronJob target)
└── reconciliation/run.ts            ← prints a reconciliation report (cron/CI/on-demand)
src/app/(payload)/                   ← Next.js App Router wiring for Payload Admin UI + REST/GraphQL
```

The rule enforced throughout: **collections stay thin**. A collection file
declares fields and wires `src/baobab` factories/hooks; it does not contain
its own tenancy, authorization or event-publication logic. This is what
lets a new content type opt into the whole architecture by composing four
or five reusable pieces rather than re-deriving them.

## 2. Request flow (ADR-0012 §3)

```text
Request
  → Payload auth (existing Users collection auth strategy)
  → collection `access` function
       → src/baobab/tenancy/access.ts: tenantScopedAccess()
            → src/baobab/context/resolve.ts: tryResolveContext(req)
                 reads req.user (canonical tenant/estate/market/locale/capabilities)
                 validates any requested estate/market/locale header against
                 the actor's authorized bindings — fails closed on mismatch
            → returns a Where clause scoping the query to context.tenantId
                 (never a boolean `true` for tenant-owned reads)
  → collection `beforeChange` hooks
       → src/baobab/tenancy/fields.ts: tenantOwnedField()
            → server-assigns tenant on create; rejects cross-tenant reassignment on update
       → src/baobab/identity/field.ts: canonicalIdField()
            → issues an immutable canonical entity id on create
  → collection `afterChange`/`afterDelete` hooks
       → src/baobab/events/hook.ts: canonicalAfterChangeHook()/canonicalAfterDeleteHook()
            → builds a canonical event envelope (ADR-0018 §11)
            → src/baobab/outbox/enqueue.ts writes it to the `outbox` collection
              using the same `req` (same DB transaction — ADR-0018 §30-32)
  → response
```

Nothing in this path performs a synchronous network call. See §5.

## 3. Canonical context (`src/baobab/context`)

`BaobabContext` is a discriminated union:

```ts
type BaobabContext =
  | { kind: 'tenant'; tenantId: string; legalEntityId?; digitalEstateId?; marketId?; locale?; actorId; capabilities; isPlatformAdmin; correlationId }
  | { kind: 'platform'; actorId; capabilities; isPlatformAdmin: true; correlationId };
```

`resolveContext(req)` throws a typed `ContextResolutionError` (never
returns a default) when:

- there is no authenticated actor (`MISSING_CONTEXT`);
- the actor has no bound tenant and is not a platform administrator
  (`INVALID_TENANT`);
- a request asserts a digital estate/market/locale outside the actor's
  authorized bindings — this is the "client tries to spoof another
  tenant's context" case (`UNAUTHORIZED_CONTEXT_SWITCH`).

`tryResolveContext(req)` wraps this for `access` functions, which must
return `false`/deny rather than throw mid-request.

Trusted context today comes from the authenticated Payload `Users`
document (itself a local projection of a canonical actor — see
`docs/identity/README.md`) plus optional `x-baobab-*` request headers,
each validated against that actor's authorized bindings before being
honoured. **No client-supplied header is trusted by itself.**

System/background code (migrations, seed scripts, the outbox dispatcher,
reconciliation) never calls `resolveContext` against a real request.
Instead:

- `createSystemContext({ actorId })` builds an explicit `PlatformContext`
  for code that already has a `BaobabContext`-shaped call site;
- `SYSTEM_ACTOR` (`src/baobab/context/system-actor.ts`) is a synthetic
  `ContextActor` you pass as `user: SYSTEM_ACTOR` to Local API calls —
  Payload's Local API attaches whatever `user` you give it to `req.user`
  for that one operation, so this flows through the same
  `resolveContext` path as an explicit platform context. This was
  validated end-to-end (see `docs/architecture/implementation-report.md`
  §"Verification performed").

## 4. Tenancy (`src/baobab/tenancy`)

- `ContentScope` (`PLATFORM | TENANT | LEGAL_ENTITY | DIGITAL_ESTATE | MARKET | LOCALE`)
  is a field every tenant-owned collection carries (`contentScopeField()`),
  defaulting to `TENANT` — `PLATFORM` is only settable by a platform
  administrator (field-level `access.update`).
- `tenantOwnedField()` is the canonical `tenant` relationship field: it is
  stripped of any client-submitted value (`access.update: () => false`)
  and re-derived from context in `beforeChange` — on create it is always
  `context.tenantId`; on update it refuses to let the record move to a
  different tenant.
- `sameTenantRelationshipField()` validates that any optional scoping
  relationship (digital estate, market, legal entity) a record points to
  actually belongs to the same tenant, closing the "cross-tenant
  relationship" hole (ADR-0012 §36).
- `tenantScopedAccess()` builds all four CRUD `access` functions from one
  call. Reads/updates/deletes return a `Where` clause
  (`{ tenant: { equals: context.tenantId } }`), not a boolean — so
  filtering is centrally enforced rather than left to each caller
  remembering a `where` clause (ADR-0012 §18, §92).

Pages additionally enforces **scoped slug uniqueness**
(`(tenant, digitalEstate, locale)`, not global — ADR-0012 §65-66) via a
custom `validate` function that queries for conflicts in that scope only.
This was a real, deliberate fix over the original schema, which had
`slug: { unique: true }` globally; see the gap analysis.

## 5. Events, outbox, webhooks (`src/baobab/events`, `outbox`, `webhooks`)

The **only** thing a collection hook does is call
`enqueueOutboxEvent({ req, envelope })`, which is a single
`req.payload.create({ collection: 'outbox', ..., req })` — using the
caller's `req` so the insert joins the same DB transaction as the content
mutation. If that insert fails, the error propagates and the whole
transaction rolls back (`canonicalAfterChangeHook` deliberately does not
catch it) — this is what keeps "content committed" and "event intent
committed" atomic (ADR-0018 §30-32, CT-001/CT-002).

Nothing publishes to RabbitMQ synchronously. `scripts/outbox/dispatch.ts`
is the only thing that does — it is meant to run on a schedule (cron/
systemd timer/CronJob; see the operations runbook) and calls
`runOutboxDispatchCycle()`:

1. selects `PENDING` rows and `FAILED_RETRYABLE` rows whose
   `nextAttemptAt` has passed;
2. marks each `PUBLISHING`, calls the `EventPublisher`;
3. on success: `PUBLISHED` + `publishedAt`;
4. on failure: increments `attemptCount`, computes bounded exponential
   backoff with jitter (`outbox/retry.ts`), and either schedules the next
   attempt (`FAILED_RETRYABLE`) or — once `maxAttempts` is reached —
   marks it `FAILED_TERMINAL` (dead-letter; never silently dropped).

This whole cycle, including duplicate-delivery tolerance, retry, and
dead-lettering, is covered by `src/baobab/outbox/dispatcher.test.ts`
against an in-memory fake, and was additionally verified against a real
Postgres database (see the implementation report).

Webhooks (`src/baobab/webhooks`) are a documented transport a consumer of
canonical events could use; `assertSafeWebhookUrl()` is a minimal SSRF
guard (rejects non-HTTPS, loopback, link-local, and RFC1918 destinations)
and `signWebhookPayload()`/`verifyWebhookSignature()` provide HMAC-SHA256
signing. No inbound/outbound webhook collection is wired into
`payload.config.ts` yet — see the implementation report for what's
deferred and why.

## 6. Content resolution (`src/baobab/content-resolution`)

Deterministic, policy-driven resolution over an in-memory candidate list
(the collections themselves still use ordinary Payload queries to fetch
the candidate set — the resolver's job is choosing *among* eligible
candidates, not querying the database):

- `buildSpecificityLevels(request, policy)` builds every subset of the
  optional dimensions present in the request that the content type's
  policy supports, ordered most-specific-first, deterministically
  tie-broken (`locale > market > digitalEstate > legalEntity`).
- `isEligible()`/`matchesLevel()` decide, per candidate, whether it
  conflicts with the request (excluded entirely) and whether it belongs
  exactly at a given specificity level.
- `resolveContent()` walks levels most-specific-first for `NONE` /
  `INHERIT` / `OVERRIDE` policies and returns the single match — or throws
  `AmbiguousResolutionError` if two candidates tie at the same level
  (ADR-0014 §65-66, "no arbitrary tie-breaking").
- `resolveComposedContent()` is the separate entry point for `COMPOSE`
  policies — it returns every eligible level's match ordered
  broad-to-narrow so a content-type-specific merge can be applied by the
  caller (composition semantics are deliberately not generalised —
  ADR-0014 §68 says they are content-type specific).
- `resolveLocaleChain()` implements explicit, cycle-safe locale fallback
  from `policy.localeFallback` — never inferred from language similarity.

This is unit tested against the ADR's own conformance-test numbering in
`src/baobab/content-resolution/resolver.test.ts`.

## 7. Canonical identity & mappings (`src/baobab/identity`, `mappings`)

- `issueCanonicalEntityId()` mints an opaque UUID. In production this
  value SHOULD be issued by the Control Plane; because none exists in
  this environment, this is the documented local fallback — the field
  (`canonicalIdField()`) is the one and only place a canonical id is
  assigned, and it is immutable afterwards (`access.update: () => false`
  plus a `beforeChange` hook that always returns the original value on
  update).
- `MappingResolver` is the interface every cross-engine identity lookup
  goes through — nothing in this codebase queries a Control Plane
  database directly (there isn't one yet). `UnavailableMappingResolver`
  is the fail-closed default (throws rather than guessing by slug/SKU);
  `InMemoryMappingResolver` is for tests/dev. A real HTTP-backed
  implementation is the only thing a future Control Plane integration
  needs to add.
- `mapping-projections` (`src/collections/MappingProjections.ts`) is the
  local, explicitly non-authoritative cache described in ADR-0013 §44-46.

## 8. Media (`src/baobab/media`, `src/collections/Media.ts`)

Media uses `@payloadcms/storage-s3` (wired in `payload.config.ts`,
enabled whenever `S3_ENDPOINT`/`S3_BUCKET` are set — the bundled
docker-compose MinIO service sets them for local dev). `accessClass`
defaults to `PRIVATE` (never an implicit public default — ADR-0016 §20).
`buildTenantScopedStorageKey()` documents the intended tenant-partitioned
key layout; `DEFAULT_MEDIA_UPLOAD_POLICY` enforces mime/size limits, and
`containsUnsafeSvgMarkup()` is a first line of defence against inline
script/event-handler SVG payloads.

## 9. Authorization (`src/baobab/authorization`)

Separate from tenancy (which is "which rows"), authorization here is
"which operations" — `isAuthorized({ context, roles, permission,
resourceTenantId, resourceDigitalEstateId, actorDigitalEstateIds })` is a
pure, default-deny function: every branch that isn't an explicit `true`
returns `false`. `DEFAULT_ROLE_PERMISSIONS` encodes the suggested
Viewer/Author/Editor/Reviewer/Publisher/Content-Administrator roles from
ADR-0017 §17-23, keeping publish distinct from edit. This module is
available for collections/endpoints that need finer-grained,
permission-level checks beyond the collection-level `tenantScopedAccess`;
`Users.platformAdministrator` and `Users.editorialRoles` are the fields
that currently feed it.

## 10. What this is not

Per ADR-0011 §31-32 and the "keep the system lean" guidance: no Kafka, no
OpenSearch, no service mesh, no dedicated DAM/workflow/translation engine,
and no Payload fork. Every place a future dedicated engine might replace
part of this (search, translation, media processing, personalisation,
content intelligence) is a `docs/architecture/implementation-report.md`
"future engine-extension point", not a piece of infrastructure stood up
speculatively today.
