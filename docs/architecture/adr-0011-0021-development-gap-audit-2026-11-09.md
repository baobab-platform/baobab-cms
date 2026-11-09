# Baobab CMS ADR-0011–0021 — development-qualification gap audit

Audit date: 2026-11-09
Evidence basis: `main` at `841445f2b2c91450ca1cefba6c0abdb23b73ea77`, ADR source files, source/workflow review, and open ADR-specific PRs #59–#69. **This is a source-level gap audit, not a claim of connected production qualification.**

## Decision/implementation distinction

All ADRs 0011–0020 are recorded Accepted. ADR-0021 is **Accepted on its separate PR #69 branch**, but `main` still contains the earlier Proposed text until that PR is merged. Acceptance of an ADR does not certify that its code, providers, database migrations and conformance evidence are complete.

Previous remediation PRs #59–#69 are open and independent; their changes must not be counted as present on `main`. Each requires review, final-head CI and evidence before merge. This additional PR is independent of those branches.

## Implementable gaps and precedence (excluding staging/production release actions)

| ADR | Current code / open work | Remaining development-implementable gap | Priority and evidence boundary |
| --- | --- | --- | --- |
| 0011 Payload adoption | Payload 3 with separate Next runtime, PostgreSQL, media adapter; #60 hardens runtime/TLS/image. | Connected engine-registration/identity and independent development contract tests; runtime negative security checks. | P1; no production-runtime claim from #60 alone. |
| 0012 Tenant isolation | `tenancy/access.ts` and context helper; #59 rejects unbound selectors. | **`Pages.validateScopedSlug` returns true before server tenant assignment, trusts client tenant, and has no DB concurrency constraint**; tenant/estate/locale negative tests and tenant lifecycle cases. | P0; add field-level regression + PG17 unique invariant; see follow-up PR. |
| 0013 Canonical mappings | `mappings/resolver.ts` in-memory local resolver; #61 fixes broad-scope disclosure. | Durable CP-backed projection, nonoverlapping active mappings, ambiguous resolution/readback, expiration/staleness and concurrent mapping claims. | P1; no assertion local resolver equals CP authority. |
| 0014 Content inheritance | `content-resolution/resolver.ts` supports NONE/INHERIT/OVERRIDE and has COMPOSE helper; #63 repairs invalid time windows. | Real estate/content-type versioned policy registry; configured locale fallbacks, resolver-backed COMPOSE and independent cache-key/readback qualification. `payload-source.ts` still embeds Nabhold-specific content key contracts. | P1; no invented fallback semantics. |
| 0015 Medusa/Payload boundary | `ProductContent.ts` preserves editorial fields; #64 guards publication. | Connected Medusa authority, canonical mapping, buyer-facing composition and hard negative tests for price/stock/variant ownership and unbound products. | P1; development sandbox feasible, cannot count stubbed Medusa as connected. |
| 0016 Media governance | S3 adapter and media policy; #65 adds upload checks and key validation. | Quarantine + scanner integration (real provider or explicitly unqualified stub), tenant-authorised short-lived private delivery, checksum/object existence reconciliation, expiry and negative MIME/SVG tests. | P0 for private delivery; avoid public-object-by-default. |
| 0017 Editorial IAM | `authorization/publication.ts` separates publish from edit; #62 denies absent estate grants; #64 adds product guard. | Full per-collection lifecycle audit, policy-driven self-approval and high-risk reviewer separation, user deprovisioning, cross-tenant negative tests and IAM/CP connected grant/revocation. | P1; raw Payload local roles do not imply canonical IAM authority. |
| 0018 Canonical events/outbox | `outbox/dispatcher.ts` retries; #66 removes silent hook identity loss; RabbitMQ publisher on `main` only calls `sendToQueue`, **not publisher confirms**. | **Broker confirmation and tenant/row integrity (this PR)**; atomic multi-worker claim/lease; separate durable destination acknowledgement for canonical broker vs estate revalidation; real RabbitMQ/PG17 crash/replay tests and consumer deduplication. | P0: without broker confirm the outbox can mark an unaccepted event PUBLISHED. At-least-once still needs consumer idempotency. |
| 0019 Schema migrations | Payload migration directory and PG17 CI; #67 adds index/snapshot preflight. | Expand/contract fixtures across versions, rename/role migration proof, down/forward-fix exercise, seeded second-tenant negative fixture and rollback evidence. | P1 development; no live deployment required. |
| 0020 Operations/resilience | Readiness probes, backup/runbook documentation; #68 fixes DB probing and error leakage. | Disposable PG17 database + S3 fixture restore verification, outbox replay, cache corruption/degraded-mode tests, isolation of operational stats; observable worker lease/recovery. | P1; protected deployment, regional failover and production RPO execution excluded. |
| 0021 Scoped corporate/estate content | Nabhold reference estate and scoped singletons; #69 accepts provider-neutral decision and fixes request-time tenant verification. | PG17 transactional uniqueness for singleton kinds; estate-specific contract/adapter bindings, signed revalidation and independent tenant/provider qualifications. The legacy `dispatch-nabhold.ts` drains the **same** outbox as the broker worker; `NabholdRevalidationPublisher` previously returned success for other tenants/unsupported events. | P0: this PR makes that legacy tool development-only/exclusive and fail-visible; **true independent destination receipts still outstanding**. |

## Implemented in this PR

1. **ADR-0018 broker acknowledgement:** use RabbitMQ confirm channels and wait for broker acceptance; nack/lost confirmation is a worker failure, not `PUBLISHED`. Tests cover positive confirmation, nack, invalid identity.
2. **Outbox integrity:** validate stored tenant and event ID against the envelope; a mismatch dead-letters instead of silently publishing/acknowledging. Tenant-partitioned workers filter at database-query time. Regression tests cover mismatched tenants/event IDs and empty selector.
3. **ADR-0021 Nabhold bridge containment:** status, requeue and dispatch operate only on the configured tenant; refuse production dispatch and require explicit `BAOBAB_LOCAL_OUTBOX_OWNER=nabhold-revalidation` exclusive-development opt-in. Unsupported and wrong-tenant events are visible terminal failures rather than silently acknowledged. **Not a provider-neutral dispatcher**, and do not run concurrently with canonical broker dispatch.

## Unqualified, urgent architectural issue: multiple independent destinations

The canonical broker and Nabhold revalidation worker currently share one `outbox.status` per event. Two independent destinations cannot both prove their delivery by consuming the same one-time status. The legacy bridge is therefore retained **only as an explicitly exclusive local-development mode**. The approved ADR-0021 provider-neutral path requires independently durable delivery/subscription state per destination, a separate consumer queue/inbox with deduplication, or equivalent provider receipts. Query filtering and broker confirms do **not** solve independent delivery acknowledgement. Design and test that path before claiming connected broker-to-estate qualification.

## Recommended next development waves

1. **P0:** Converge/open #59–#69 without merging prematurely; repair source-level identity/security gaps, implement PostgreSQL 17 scoped page/singleton uniqueness, and protect private media; preserve current compatibility.
2. **P0:** Separate canonical event publication from estate revalidation subscription with durable per-destination state, replay and dead letters; qualify RabbitMQ publisher confirms with a real broker and PostgreSQL outbox.
3. **P1:** Authoritative CP/IAM and Medusa development sandbox tests across two independently owned tenants and multiple estates. Require negatives for access, price and mapping authority.
4. **P1:** Estate-specific content profiles, versioned resolution policies, signed adapter routing, tenant/estate cache readback. Nabhold is first case, not a platform-wide default.
5. **P1:** Disposable PG17 schema evolution and backup/object-store recovery; observable scheduled worker tests, no protected staging/production activation.

## Explicitly excluded from this audit's implementation permission

Protected staging and production deployments, environment secret issuance, external provider live activations, formal operational RPO/RTO or regulatory certification, multi-region failover, and any assertion of production-ready Control Plane binding. Development-side test harnesses, negative checks and provider sandboxes remain in scope.
