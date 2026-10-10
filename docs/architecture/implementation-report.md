# Final Implementation Report

## Scope of this change set

This change set implements Phases 1–7 of the requested work (Foundation,
Content Model, Identity/Authorization, Product/Media, Events/Reliability,
Schema/Migration Governance, Operational Hardening) with real depth on the
architecturally load-bearing boundaries, plus Phase 8 (Extension
Readiness) at the pattern level. Phase 0 (Discovery/Gap Analysis) is
`docs/architecture/gap-analysis.md`.

Given the size of the governing ADR family (~17,000 normative lines) and
that this is a single change-controlled session against a real repository
with a real reviewer, the engineering judgement applied throughout was:
**build fewer things completely rather than many things superficially.**
Every collection, hook and module listed as "Implemented" below was
type-checked, unit-tested where the logic is pure, and — for the
Payload-specific wiring — verified against a real PostgreSQL database and
a real `next build`/`next dev` server in this session (not just asserted).
See "Verification performed" below for exactly what was run.

## Implemented

- Canonical Baobab context resolution, fail-closed, with explicit
  platform-scope support (`src/baobab/context`).
- Centralised tenant enforcement (access-control factories + field hooks)
  applied to every tenant-owned collection (`src/baobab/tenancy`,
  `src/collections/*.ts`).
- Canonical entity identity, immutable, distinct from Payload IDs
  (`src/baobab/identity`).
- Canonical mapping type model + resolver interface with a fail-closed
  production default and an in-memory test/dev implementation
  (`src/baobab/mappings`).
- Deterministic content-resolution engine (specificity, inheritance modes,
  locale fallback, composition, ambiguity detection)
  (`src/baobab/content-resolution`), unit-tested against the ADR's own
  conformance-test numbering.
- New collections: `digital-estates`, `markets`, `product-content`,
  `media`, `outbox`, `audit-logs`, `mapping-projections`.
- Extended existing collections (`users`, `tenants`, `organisations`,
  `pages`) additively — legacy fields kept, canonical fields added
  alongside (expand-and-contract, ADR-0019 §21-23).
- Scoped (not global) slug uniqueness on `pages` — a real correctness fix
  over the original schema.
- Role/permission/capability model with a default-deny evaluator
  (`src/baobab/authorization`).
- Media governed as a resource: S3-compatible storage adapter, explicit
  access classes (default `PRIVATE`), upload policy (size/mime/unsafe-SVG
  checks) (`src/baobab/media`, `src/collections/Media.ts`).
- Canonical event envelope + transactional outbox, replacing the
  synchronous, hook-name-as-event-name AMQP publish that existed before
  this change (`src/baobab/events`, `src/baobab/outbox`).
- Webhook signing/verification + an SSRF-guarded delivery helper
  (`src/baobab/webhooks`) — a documented transport, not yet wired to a
  live outbound-webhook collection (see Deferred).
- Audit record writer + immutable `audit-logs` collection
  (`src/baobab/audit`).
- Health/readiness endpoints distinguishing degraded from unavailable
  (`src/baobab/observability`).
- Reconciliation predicates + a runnable CLI report
  (`src/baobab/reconciliation`, `scripts/reconciliation/run.ts`).
- A real, generated, **applied** initial database migration
  (`migrations/20260905_121418_initial_schema.ts`).
- **Fixed the Payload Admin UI / REST / GraphQL wiring**, which did not
  actually work in the original repository (see gap analysis §1) — added
  the Next.js App Router scaffolding Payload 3 requires
  (`src/app/(payload)/**`), `next.config.mjs`, and corrected
  `package.json` scripts (`next dev`/`next build`/`next start` instead of
  the non-existent `payload dev`/`payload build`/`payload start`
  commands).
- CI (`.github/workflows/ci.yml`): lint, typecheck, unit tests + coverage,
  `next build`, a migration-apply gate against a real Postgres service
  container, dependency review, and an informational `npm audit`.
- Docker: multi-stage `Dockerfile` producing a Next.js standalone runtime
  image; `docker-compose.yml` gained a MinIO service (+ bucket
  bootstrap) for local S3-compatible storage; devcontainer updated to
  match.
- 80 unit tests across context, tenancy, content-resolution, mappings,
  authorization, media policy, outbox retry/dispatch, webhooks, and
  reconciliation, including explicit negative-tenancy cases.

## Verification performed (not just asserted)

This environment has no live Control Plane, Medusa, iDempiere, or
identity provider — those remain interfaces. Everything else that could
be run, was:

1. `npx tsc --noEmit` — clean, repeatedly, after every module.
2. `npx eslint .` — clean (only generator-produced-file warnings remain).
3. `npx vitest run --coverage` — 80/80 tests passing.
4. `npx next build` — a full production build of the Admin UI + REST +
   GraphQL routes compiled successfully (this caught and fixed three real
   type errors that `tsc --noEmit` alone had not — Payload's generated
   `payload-types.ts` is stricter about `json` field shapes than hand
   -written interfaces).
5. A local PostgreSQL 16 instance was started in this session (no Docker
   daemon was available in the sandbox, so `apt`-installed Postgres was
   used directly) and:
   - `payload migrate:create` generated a real migration from this
     codebase's actual collection set;
   - `payload migrate` applied it successfully;
   - a Local-API smoke script created a tenant, a platform-admin user, a
     legal entity, and a page; published the page; confirmed
     `canonicalEntityId`/`canonicalActorId`/`canonicalLegalEntityId` were
     assigned; confirmed three outbox rows were created; ran the outbox
     dispatcher against an in-memory publisher and confirmed all three
     reached `PUBLISHED`; created a second tenant and proved it could
     reuse the first tenant's exact slug (`home`) without conflict,
     directly demonstrating ADR-0012 CT-006.
   - `scripts/reconciliation/run.ts` ran against this live database and
     reported zero anomalies plus an accurate outbox backlog count.
6. `next dev` was started against the same live database and
   `/api/health/live`, `/api/health/ready`, `/admin`, and
   `/api/graphql-playground` were all confirmed to return HTTP 200.
7. `docker compose config` validated both `docker-compose.yml` and the
   devcontainer's compose overlay parse and merge correctly. The
   `Dockerfile` itself could **not** be built in this sandbox (no Docker
   daemon available) — it follows the standard, well-established
   Next.js-standalone multi-stage pattern, but is the one artifact in
   this change set that is reasoned-through rather than executed. Treat
   a first real `docker build` in CI/staging as the remaining
   verification step.

## Partially implemented

- **Control Plane integration** — the `MappingResolver` boundary is
  complete and correctly fails closed; there is no Control Plane service
  in this GitHub organisation to point it at yet. Same shape of gap for a
  real identity provider (ADR-0017 §7-10) — Payload local auth remains
  the actual authentication mechanism.
- **Tenant-safe migration *tests*** (ADR-0019 §84, CT-001–CT-004) — the
  process and tooling exist (`db:generate`, `db:migrate`, the CI
  migration gate), and the one migration that exists was verified
  data-safe by construction (it's the initial schema against an empty
  database — there is no prior tenant data it could have moved). A
  second, non-trivial migration with a fixture-based before/after test is
  the natural next exercise of this machinery, not yet needed.
- **Isolation-profile-driven physical topology** (ADR-0012 §12,
  ADR-0020 §8-11) — the context fields exist and are threaded through
  everywhere; there is exactly one deployment topology (shared) to
  demonstrate them against.

## Deferred intentionally

- **Navigation, Taxonomy, SEO-config, Redirects, Documents,
  ContentFragments collections** (prompt §63) — the ADRs list these as
  candidates to evaluate, not mandates. Building five more collections
  with no consuming digital estate to validate their shape against would
  be exactly the "speculative infrastructure" ADR-0011 §72 and §66 warn
  against. `Pages` demonstrates the full pattern (canonical id, scope,
  content-resolution, events); adding another content type is now a
  ~50-line collection file, not a new architectural exercise.
- **Real Search/Translation/Personalisation/Workflow/Content-Intelligence
  provider interfaces** — ADR-0011 §66 explicitly says not to introduce
  OpenSearch/a workflow platform/etc. without a measured requirement.
  `MappingResolver` and `EventPublisher` already demonstrate the intended
  provider-interface pattern; writing five more empty interfaces with no
  implementation would be ceremony, not extensibility (ADR-0011 §65).
- **Outbound webhook management collection/UI** — signing and
  SSRF-guarded delivery exist as library functions; there's no tenant-
  facing "configure a webhook destination" collection yet because no
  consumer has asked for one.
- **Field-level malware/content scanning integration** for media beyond
  the SVG heuristic — ADR-0016 §40 explicitly treats the real scanner as
  a pluggable, separately-selected dependency.
- **Broader `baobab-platform/shared` consumption** — the Shared repository now
  publishes contracts, and this engine consumes the five listed in
  `contracts.lock.yaml` (the `content/v1` capability, request/response schemas
  and OpenAPI, plus the Control Plane OpenAPI used for context validation).
  The event envelope shape, canonical identifiers and context schemas
  introduced in the original implementation remain local, each with a
  "this is where the shared package plugs in" comment per ADR-0011 §34 and
  ADR-0018 §5. They have not been reconciled against Shared's `events/v1` and
  Control Plane contracts in this review.
- **CDN/application caching layer** — ADR-0020 §59-77 is about
  discipline *if* a cache is introduced, not a mandate to introduce one;
  no measured requirement exists yet.

## Risks and technical debt

- The `payload migrate:create` output requires a manual
  `import type` fix on every regeneration in this repo's `tsconfig`
  (`verbatimModuleSyntax: true`) — documented in
  `docs/migrations/README.md`. This is an upstream Payload
  code-generation quirk, not a bug in this codebase's logic.
- `npm audit` currently reports transitive advisories inherited from the
  Payload/Next dependency tree; the CI job runs it as informational
  (`continue-on-error: true`) rather than blocking, since fixing them
  requires upstream releases this repository doesn't control. Revisit
  this policy once the organisation has a real vulnerability-management
  process for third-party CMS dependencies.
- The Local-development default for `MappingResolver` and
  `EventPublisher` (in-memory) must never be wired into a production
  `payload.config.ts` — there is no runtime guard preventing that
  misconfiguration today beyond documentation and code review.
- `Regions` is kept as explicitly-deprecated legacy data alongside the
  new `Markets` collection rather than migrated, to avoid a destructive,
  unreviewed data migration in the same change set that introduces the
  new model (ADR-0019 §18-22, expand-and-contract). A follow-up migration
  should backfill `Markets` from `Regions` once real tenant data exists
  to migrate.
- The Dockerfile is unbuilt-and-unrun in this session (see "Verification
  performed" §7).

## Future engine-extension points

These are the seams ADR-0011 §65-66 and §38 (Phase 8) asked to be kept
open, and how this change set keeps them open without standing up
infrastructure prematurely:

| Future capability | Extension point already in place |
|---|---|
| Dedicated search engine | `resolveContent()` operates on an in-memory candidate list handed to it — a search index would populate that candidate list instead of a Payload query, without changing the resolver's contract |
| Translation management system | `locale` is already a first-class, independently-resolved dimension everywhere (context, content-resolution, product-content) — a TMS would populate localized records the same way an editor does today |
| Dedicated DAM | `canonicalMediaId` already outlives the Payload `media` record; a DAM migration is "point `ExternalReference` at the DAM instead of Payload" once `MappingResolver` has a real backing service |
| Content intelligence (Pulse/Haystack) | Canonical events (`content.*`) are the exact integration surface — a consumer subscribes to the outbox-published events; nothing in the publish path assumes or requires such a consumer to exist |
| Personalisation/decisioning | `resolveContent()`'s `ResolutionResult` already carries enough context (matched scope, trace) for a future layer to select among eligible representations rather than Payload picking one unconditionally |
| Real Control Plane | `MappingResolver`, `BaobabContext` resolution, and the `tenants`/`digital-estates`/`markets` "local projection" collections are exactly the seams a real Control Plane integration replaces — see `docs/mappings/README.md` |
