# ADR-0011–0020 Conformance Matrix

Status legend: **✅ Implemented** — real, verified code. **🟡 Partial** —
architecturally supported but not exercised end-to-end or missing a
production-hardening detail. **⏭ Deferred** — intentionally out of scope
for this change set, with a documented extension point.

| # | Criterion (from the governing prompt) | Status | Evidence |
|---|---|---|---|
| 1 | Payload remains independently deployable | ✅ | `Dockerfile`, `next.config.mjs` (`output: 'standalone'`); no shared build/release with Medusa/iDempiere/Control Plane exists or is assumed |
| 2 | Existing working functionality preserved or intentionally migrated | ✅ / see note | All original collection slugs, fields, and the `regions` collection kept; **the original `dev`/`build`/`start` npm scripts were not actually functional** (see gap analysis §1) — fixed as part of this change, documented as a correctness fix, not a behaviour change |
| 3 | Tenant boundaries automatically enforced | ✅ | `src/baobab/tenancy/access.ts` (`tenantScopedAccess` returns `Where` clauses, never relies on caller-added filters); negative tests in `tenancy/access.test.ts`, `context/resolve.test.ts` |
| 4 | Tenant and legal entity remain distinct | ✅ | `organisations` collection (`ADR-0012 §23`), separate `tenantId`/`legalEntityId` in `BaobabContext` |
| 5 | Digital estates, markets, locales first-class contextual dimensions | ✅ | `digital-estates`, `markets` collections; `locale` field on `Pages`/`ProductContent`; `BaobabContext` carries all three independently |
| 6 | Canonical content IDs distinct from Payload IDs | ✅ | `canonicalIdField()` on Pages/Organisations/DigitalEstates/Markets/ProductContent/Media, immutable, independent of Payload's own `id` |
| 7 | Canonical mapping uses Control Plane contracts | 🟡 | `MappingResolver` interface is the exclusive integration boundary (`src/baobab/mappings/resolver.ts`); no real Control Plane exists in this environment, so `UnavailableMappingResolver` (fail-closed) is the production default and `InMemoryMappingResolver` backs tests — swapping in an HTTP client is the only remaining step |
| 8 | No other engine database queried directly | ✅ | No Medusa/iDempiere/Control Plane connection strings or clients anywhere in the codebase |
| 9 | Product editorial content separated from Medusa commerce truth | ✅ | `product-content` collection carries only editorial fields + a non-authoritative `commerceProjection` group explicitly marked as such; no price/SKU/inventory field |
| 10 | ERP data not replicated into CMS authority | ✅ | No ERP-shaped collection or field exists |
| 11 | Media binaries use durable external storage in production | ✅ | `@payloadcms/storage-s3` wired in `payload.config.ts`; MinIO in `docker-compose.yml` for dev, real S3-compatible endpoint in prod via env |
| 12 | Media identity independent of URLs and object keys | ✅ | `canonicalMediaId` field, `buildTenantScopedStorageKey()` documents key layout is a projection, not identity |
| 13 | Platform identity external to Payload | 🟡 | `canonicalActorId` field + `SYSTEM_ACTOR`/`resolveContext` model this correctly; no real IdP/SSO integration exists to point at (none in this org yet) — Payload local auth remains the actual authentication mechanism, documented as the exceptional/bootstrap path per ADR-0017 §8 |
| 14 | Authorisation context-aware and default-deny | ✅ | `src/baobab/authorization/evaluator.ts` (`isAuthorized`), `tenancy/access.ts` — every access function's un-matched branch returns `false` |
| 15 | Content administration distinct from platform administration | ✅ | `Users.platformAdministrator` vs `Users.editorialRoles`; `platformAdminOnlyAccess()` vs `tenantScopedAccess()`; Payload Admin is the only UI wired — no Control Plane UI exists in this repo |
| 16 | Canonical events independent of Payload hook internals | ✅ | `CanonicalEventType` vocabulary (`content.*`, `media.*`, `content.product.*`) is decoupled from collection/hook names; `buildCanonicalEvent()` is the only envelope constructor |
| 17 | Durable event publication uses an outbox | ✅ | `src/baobab/outbox`; verified against a real Postgres DB (see implementation report) |
| 18 | Event consumers can be idempotent | ✅ | Every envelope carries a unique `eventId`; `outbox/dispatcher.test.ts` proves duplicate-safe retry semantics |
| 19 | Schema evolution is migration-driven | ✅ | `migrations/20260905_121418_initial_schema.ts` generated and **applied against a real Postgres instance** in this session; `db:generate`/`db:migrate` scripts |
| 20 | Tenant-safe migration tests exist | 🟡 | The generated migration was verified not to move data between tenants (empty-DB initial migration — no data risk); ADR-0019's fuller requirement (representative prior-state fixtures for every future migration) is a process to follow going forward, documented in `docs/migrations/README.md`, not something a second migration exists yet to test |
| 21 | Region/isolation-profile ready | 🟡 | `BaobabContext.engineInstanceId`/`isolationProfile` fields exist and are threaded through; no multi-instance deployment exists to exercise them against |
| 22 | Caching cannot leak content across tenants/estates | 🟡 | `resolveContent()`'s deterministic, context-keyed resolution is the foundation a cache key would be built from; no cache layer is implemented yet (ADR explicitly discourages introducing infrastructure — Redis/CDN — without a measured need) |
| 23 | Reconciliation tooling exists | ✅ | `src/baobab/reconciliation/checks.ts` + `scripts/reconciliation/run.ts`, run against a real DB in this session |
| 24 | Operational health and event backlog observable | ✅ | `/api/health/live`, `/api/health/ready` (verified via a real `next dev` server in this session, see implementation report) |
| 25 | CI validates organisation contracts | 🟡 | `.github/workflows/ci.yml` validates lint/typecheck/tests/build/migration-apply; there is no `baobab-platform/shared` contract repository yet to validate against |
| 26 | Existing and new tests pass | ✅ | 80 unit tests (`npm test`), `tsc --noEmit`, `eslint .`, `next build` all verified clean in this session |
| 27 | No hard-coded tenant-specific branches | ✅ | Grep-verified: no `if (tenant ===` / `if (market ===` pattern anywhere in `src/` |
| 28 | No unnecessary platform capability absorbed into Payload | ✅ | No search engine, DAM, workflow engine, or translation engine embedded; see §10 of the architecture overview |
| 29 | Future externalisation of search/translation/media-processing/personalisation/workflow/content-intelligence architecturally possible | 🟡 | The provider-boundary *pattern* is established (`MappingResolver`, `EventPublisher` are exactly this shape); dedicated `SearchProvider`/`TranslationProvider`/etc. interfaces are not yet written since nothing currently implements them — see implementation report "future engine-extension points" |
| 30 | Documentation explains ADR-0011–0020 implementation | ✅ | This file + `docs/architecture/overview.md` + per-topic docs under `docs/*` |

## Per-ADR invariant coverage (representative, not exhaustive)

Given the size of ADR-0011–0020 (~17,000 lines, ~250 individually numbered
invariants across the ten documents), this section lists the invariants
with the highest blast radius if violated, and where each is enforced.
Invariants not listed here are addressed structurally by the same
mechanism as a listed one from the same ADR (e.g. every "X must be
tenant-scoped" invariant in ADR-0012 reduces to the same
`tenantScopedAccess`/`tenantOwnedField` mechanism).

| ADR | Invariant | Enforcement |
|---|---|---|
| 0012 §9 | Every tenant-owned record has exactly one tenant owner | `tenantOwnedField()` — required relationship, server-assigned |
| 0012 §10, §94 | Null tenant is never implicitly global | `contentScopeField()` defaults to `TENANT`; `PLATFORM` requires an explicit, privileged field-level write |
| 0012 §17 | Clients cannot self-assign tenant ownership | `tenantOwnedField().access.update: () => false` + `beforeChange` override |
| 0012 §65-66 | Slug collisions across tenants are normal, not an error | `Pages.slug` scoped-uniqueness `validate` (see architecture overview §4) |
| 0013 §30 | Canonical identity is immutable | `canonicalIdField()` — `access.update: () => false`, `beforeChange` always keeps `originalDoc` value |
| 0013 §37 | Ambiguous mapping fails rather than guesses | `InMemoryMappingResolver.resolveByExternalReference` throws on >1 candidate; `detectAmbiguousMatch()` |
| 0014 §65-66 | No arbitrary tie-breaking between equally specific records | `resolveContent()` throws `AmbiguousResolutionError` |
| 0014 §27-28 | Locale fallback is explicit and cannot cross tenants | `resolveLocaleChain()` reads only `policy.localeFallback`; tenant filtering happens upstream and is never relaxed by locale logic |
| 0016 §20 | Media access class is explicit; null never means public | `Media.accessClass` required field, `defaultValue: PRIVATE` |
| 0017 §29 | Default-deny authorization | `isAuthorized()` — see architecture overview §9 |
| 0018 §30 | Content mutation and outbox insertion are transactionally coupled | `enqueueOutboxEvent()` reuses the triggering hook's `req`; `canonicalAfterChangeHook` does not catch the resulting error |
| 0018 §38 | At-least-once delivery, idempotent consumers | Every envelope has a unique `eventId`; dispatcher tolerates re-delivery on crash-after-publish-before-ack |
| 0019 §7 | Production schema is code | `payload.config.ts` + `src/collections/*.ts`; `migrations/` is the only path to schema change |
| 0020 §8 | `IsolationProfile` (not code) determines deployment topology | `BaobabContext.isolationProfile` is a passthrough field, never branched on in application code |
