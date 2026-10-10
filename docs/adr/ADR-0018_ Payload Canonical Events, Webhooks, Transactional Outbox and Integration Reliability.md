# ADR-0018: Payload Canonical Events, Webhooks, Transactional Outbox and Integration Reliability

**Status:** Accepted  
**Date:** 2026-09-04  
**Decision Class:** Platform Architecture / Integration / Eventing  
**Scope:** Baobab Content Engine  
**Repository:** `baobab-platform/baobab-cms`  
**Parent ADRs:**  
- `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`
- `ADR-0013-payload-canonical-content-identity-and-external-mapping.md`
- `ADR-0015-payload-medusa-product-content-composition-and-authority.md`

**Related Systems:** Baobab Control Plane, MedusaJS Trade Engine, iDempiere ERP Engine, Digital Estates, `baobab-platform/shared`  
**Supersedes:** None  
**Architectural Style:** Event-driven, contract-first, at-least-once delivery, idempotent consumers, outbox-backed publication

---

# 1. Context

The Baobab Content Engine participates in a distributed platform composed of independently deployable engines.

Payload CMS must therefore communicate meaningful content changes to other systems without creating tight runtime coupling.

Relevant consumers may include:

- digital estates;
- Baobab Control Plane;
- MedusaJS Trade Engine;
- iDempiere ERP Engine;
- search/indexing services;
- analytics services;
- cache invalidation components;
- workflow services;
- notification services;
- future intelligence engines.

Examples of significant content lifecycle changes include:

```text id="bi84o2"
page published
article updated
product editorial content changed
media retired
navigation changed
campaign activated
```

These changes may need to propagate asynchronously.

Payload hooks alone are not a sufficient cross-platform contract.

---

# 2. Problem Statement

A naïve implementation might directly perform remote calls from Payload hooks:

```text id="x5bkja"
afterChange hook
    │
    ├── call Medusa
    ├── call search
    ├── purge CDN
    └── call analytics
```

This creates several problems:

- one dependency outage may break editorial operations;
- transaction outcome and external side effects may diverge;
- retries may produce duplicates;
- hook code becomes integration middleware;
- failures may be lost after process restart;
- consumers become coupled to Payload implementation details;
- replay becomes difficult;
- auditability is poor.

Baobab therefore requires a durable event-publication architecture.

---

# 3. Decision

Payload SHALL publish cross-platform lifecycle changes using **canonical events backed by a transactional outbox or equivalent durable publication mechanism**.

The preferred flow is:

```text id="y3rtie"
Payload Mutation
      │
      ▼
Database Transaction
      │
      ├── Content Change
      │
      └── Outbox Record
              │
              ▼
        Event Publisher
              │
              ▼
       Event Transport
              │
       ┌──────┼──────┐
       ▼      ▼      ▼
    Search  Estates  Engines
```

Content persistence and durable intent to publish SHALL be committed together where technically possible.

---

# 4. Canonical Events Versus Payload Hooks

Payload hooks SHALL be treated as implementation mechanisms.

Canonical events SHALL be treated as platform contracts.

Therefore:

```text id="ievlmr"
Payload hook name
      !=
Canonical event type
```

A change in Payload hook implementation SHALL not require downstream consumers to change their event contracts.

---

# 5. Event Contract Authority

Organisation-wide event schemas SHALL be governed through `baobab-platform/shared`.

Payload SHALL implement those schemas.

Payload SHALL NOT independently define incompatible cross-platform envelopes.

---

# 6. Event Categories

Payload-originating canonical events MAY include categories such as:

```text id="ky7isn"
content.*
media.*
navigation.*
campaign.*
taxonomy.*
```

Exact event names SHALL be governed centrally.

---

# 7. Example Content Events

Events may include:

```text id="djq9wc"
content.created
content.updated
content.published
content.unpublished
content.archived
content.retired
```

---

# 8. Example Media Events

Media events may include:

```text id="awtfnd"
media.created
media.updated
media.published
media.quarantined
media.retired
```

---

# 9. Product Editorial Events

Product content events MAY include:

```text id="gu27el"
content.product.created
content.product.updated
content.product.published
content.product.unpublished
```

They SHALL not masquerade as Medusa commerce events.

---

# 10. Navigation Events

Navigation changes MAY publish:

```text id="7rcvyg"
navigation.updated
navigation.published
```

where downstream consumers need to invalidate or rebuild experiences.

---

# 11. Canonical Event Envelope

Canonical events SHOULD include, where applicable:

```text id="556fqh"
event_id
event_type
event_version
occurred_at
source_engine
source_engine_instance
canonical_entity_id
canonical_entity_type
tenant_id
legal_entity_id?
digital_estate_id?
market_id?
locale?
correlation_id
causation_id?
trace_id?
payload
```

Exact schema belongs in `baobab-platform/shared`.

---

# 12. Event ID

Every canonical event SHALL have a globally unique event identifier.

Consumers SHALL be able to use it for deduplication.

---

# 13. Event Type

Event types SHALL describe business/platform meaning rather than implementation detail.

Preferred:

```text id="ddn1et"
content.published
```

Avoid:

```text id="ocya1u"
payload.afterChange.pages
```

---

# 14. Event Version

Event schemas SHALL be explicitly versioned.

Consumers SHALL not rely on undocumented field additions or deletions.

---

# 15. Source Engine

The envelope SHALL identify the originating engine.

For example:

```text id="thwh1c"
source_engine = CONTENT
```

---

# 16. Source Engine Instance

The specific Payload engine instance SHOULD be identifiable for:

- diagnostics;
- regionalisation;
- reconciliation;
- provenance.

---

# 17. Canonical Entity Identity

Events representing canonical content SHALL carry canonical entity identity.

Payload local IDs MAY additionally be included as external-reference metadata where useful.

---

# 18. External References

Where useful, an event MAY include:

```text id="7ludpt"
external_reference:
  engine
  engine_instance
  external_type
  external_id
```

This supports debugging without replacing canonical identity.

---

# 19. Tenant Context

Tenant context SHALL be explicit in canonical events where the event is tenant-owned.

Consumers SHALL not infer tenant solely from the entity ID.

---

# 20. Digital Estate Context

Where a change is estate-specific, the digital estate SHALL be included explicitly.

---

# 21. Market and Locale Context

Market and locale SHALL be included where they materially affect event meaning.

They SHALL not be assumed from tenant or estate.

---

# 22. Correlation ID

Events SHOULD carry a correlation identifier connecting actions across services.

Example:

```text id="j1exdh"
editor publishes page
    ↓
content.published
    ↓
cache invalidation
    ↓
estate refresh
```

All may share a correlation chain.

---

# 23. Causation ID

Where one event causes another action or event, the child SHOULD preserve causation metadata.

---

# 24. Trace Context

Distributed tracing metadata MAY be propagated where appropriate.

---

# 25. Event Payload

The payload SHALL contain the minimum data necessary for the event's intended contract.

Events SHALL NOT become uncontrolled replicas of entire Payload documents.

---

# 26. Event Notification Versus State Transfer

Baobab SHALL distinguish:

```text id="gg1dtp"
Event Notification
```

from:

```text id="ov40jj"
Event-Carried State Transfer
```

A given event contract SHALL deliberately choose which model it uses.

---

# 27. Default Preference

For most content lifecycle events, Baobab SHOULD favour notification plus stable identity over embedding complete content.

Consumers can retrieve authoritative state where appropriate.

---

# 28. When Event-Carried State Is Appropriate

Selected projections MAY be carried where:

- consumer latency requires it;
- the payload is bounded;
- the contract is stable;
- replay requires historical state.

This SHALL be explicit.

---

# 29. No Large Binary Payloads

Media binaries SHALL NOT be embedded in ordinary canonical event messages.

Media events SHALL reference assets.

---

# 30. Transactional Outbox

Payload SHALL use a transactional outbox or equivalent mechanism for durable publication.

The objective is:

```text id="jmqoby"
content committed
AND
event intent committed
```

rather than:

```text id="rqfv6r"
content committed
BUT
event lost
```

---

# 31. Outbox Record

A conceptual outbox record MAY include:

```text id="s5qybe"
id
event_id
event_type
event_version
aggregate_id
tenant_id
payload
created_at
published_at?
attempt_count
next_attempt_at?
status
```

Exact schema is implementation-specific.

---

# 32. Same-Transaction Requirement

Where the database/storage architecture supports it, content mutation and outbox insertion SHALL occur in the same transaction.

---

# 33. No Distributed Transaction

Baobab SHALL NOT require distributed ACID transactions across Payload and downstream engines.

Reliability SHALL be achieved through:

- durable publication;
- idempotency;
- retry;
- reconciliation.

---

# 34. Event Publisher

A dedicated publisher/worker SHALL dispatch pending outbox entries.

The synchronous editorial request SHOULD not depend on successful delivery to every downstream consumer.

---

# 35. Publishing State

Outbox entries SHOULD distinguish states equivalent to:

```text id="8o2g6w"
PENDING
PUBLISHING
PUBLISHED
FAILED_RETRYABLE
FAILED_TERMINAL
```

Exact terminology may differ.

---

# 36. Retry

Transient publication failure SHALL trigger controlled retry.

Retry SHOULD use:

- bounded exponential backoff;
- jitter where appropriate;
- maximum-attempt policy;
- dead-letter or intervention state.

---

# 37. Retry Must Be Idempotent

Retries SHALL not create semantic duplicates at consumers.

---

# 38. At-Least-Once Delivery

Baobab SHALL assume **at-least-once** event delivery where reliable asynchronous integration is used.

Consumers SHALL therefore be idempotent.

---

# 39. Exactly-Once Illusion

The architecture SHALL NOT depend on transport-level "exactly once" as a universal guarantee.

Business idempotency remains necessary.

---

# 40. Consumer Idempotency

Consumers SHOULD deduplicate by:

```text id="ec51wm"
event_id
```

and, where necessary, domain idempotency keys.

---

# 41. Idempotent Side Effects

Repeated delivery of:

```text id="bo19ub"
content.published
```

SHALL not create multiple duplicate search records, cache jobs or content copies.

---

# 42. Ordering

Global ordering SHALL NOT be assumed.

Where ordering matters, events SHOULD carry enough information for consumers to detect stale or superseded events.

Possible mechanisms include:

- aggregate version;
- occurred time;
- sequence number;
- entity revision.

---

# 43. Per-Entity Ordering

Where transport permits, ordering MAY be preserved per canonical entity or partition.

The architecture SHALL still tolerate replay and duplication.

---

# 44. Stale Event Detection

Consumers SHOULD be able to reject an older event where a newer state has already been applied.

---

# 45. Out-of-Order Delivery

Out-of-order delivery SHALL be treated as a normal distributed-system possibility.

---

# 46. Replay

Canonical events SHOULD be replayable where practical.

Replay is useful for:

- search rebuild;
- analytics recovery;
- new consumer bootstrap;
- reconciliation.

---

# 47. Replay Safety

Consumers SHALL distinguish replay from new business actions where such distinction matters.

Replaying an event SHALL not, for example, resend customer notifications without explicit policy.

---

# 48. Event Retention

Event transport and archival retention SHALL be defined operationally.

Retention period MAY vary by event category.

---

# 49. Outbox Retention

Published outbox rows MAY eventually be archived or purged according to operational policy.

They SHALL remain long enough to support troubleshooting and guaranteed-delivery objectives.

---

# 50. Dead-Letter Handling

Events that repeatedly fail publication or consumption SHOULD enter a visible dead-letter or equivalent intervention path.

They SHALL not disappear silently.

---

# 51. Failure Visibility

Operators SHALL be able to determine:

- what failed;
- when;
- why;
- how many attempts occurred;
- which tenant/entity was affected.

---

# 52. Webhooks

Payload MAY expose or consume webhooks.

Webhooks SHALL be treated as one transport/integration mechanism, not the canonical domain model.

---

# 53. Canonical Event First

Where a webhook represents a canonical platform lifecycle event, the webhook payload SHOULD derive from the canonical event contract.

---

# 54. Webhook Signing

Outbound webhooks SHOULD support cryptographic signing or equivalent authenticity verification.

---

# 55. Webhook Secrets

Webhook credentials SHALL be managed through approved secret-management mechanisms.

They SHALL not be stored as ordinary editable content.

---

# 56. Webhook Retry

Webhook delivery SHALL support retry and failure visibility.

---

# 57. Webhook Idempotency

Webhook consumers SHALL be able to deduplicate repeated deliveries.

---

# 58. Webhook Timeout

Slow webhook consumers SHALL not block editorial request transactions.

---

# 59. Webhook Endpoint Governance

Tenant-configurable webhooks, if supported, SHALL be constrained by security policy.

The system SHALL guard against:

- SSRF;
- internal-network targeting;
- malicious destinations;
- unrestricted secret exposure.

---

# 60. Inbound Webhooks

Inbound webhooks SHALL:

- authenticate source;
- validate schema;
- validate tenant/context;
- use idempotency;
- reject unsupported versions.

---

# 61. Payload Hooks

Payload hooks MAY:

- validate;
- enrich local records;
- create outbox entries;
- schedule internal work.

They SHOULD NOT contain extensive cross-engine orchestration.

---

# 62. Hook Failure Semantics

Hook failures that are required for content consistency MAY fail the transaction.

Failures of external integration SHOULD generally be handled asynchronously through the outbox rather than making content persistence depend on remote availability.

---

# 63. No Synchronous Fan-Out

This pattern SHALL be avoided:

```text id="hfvi4m"
Publish Page
   │
   ├── Medusa HTTP
   ├── search HTTP
   ├── analytics HTTP
   ├── CDN HTTP
   └── notification HTTP
```

as part of one editorial transaction.

---

# 64. Command Versus Event

Baobab SHALL distinguish commands from events.

Command:

```text id="311mu6"
purge this cache
```

Event:

```text id="burv46"
content was published
```

They SHALL not be conflated.

---

# 65. Event Past Tense

Canonical events SHOULD represent something that has happened.

---

# 66. Consumers Own Reactions

A producer SHALL not need to know every consumer reaction.

For example, Payload publishes:

```text id="nkh3r4"
content.published
```

and separate consumers may independently:

- purge cache;
- reindex search;
- refresh sitemap;
- notify analytics.

---

# 67. Coupling Reduction

Adding a new consumer SHOULD not require modification of Payload's core content persistence logic.

---

# 68. Search Integration

Search indexing SHOULD consume events or approved projections.

Payload SHALL not couple content commits synchronously to search availability.

---

# 69. Cache Invalidation

Content lifecycle events MAY trigger cache invalidation.

Invalidation logic SHOULD respect:

- tenant;
- estate;
- market;
- locale;
- canonical entity.

---

# 70. Digital Estate Refresh

Digital estates MAY consume canonical events to:

- revalidate pages;
- purge caches;
- regenerate static artefacts.

They SHALL not infer identity from Payload IDs.

---

# 71. Medusa Integration

Payload product-content events SHALL use canonical product mappings established in ADR-0015.

They SHALL not directly mutate Medusa commerce state unless an explicit command contract exists.

---

# 72. ERP Integration

Content events SHALL not directly create arbitrary ERP state.

Any ERP reaction SHALL occur through governed integration contracts.

---

# 73. Control Plane Events

The Control Plane may publish:

```text id="jtu25s"
tenant.updated
digital_estate.updated
market.updated
capability_binding.changed
engine_instance.changed
```

Payload MAY consume these to update local projections.

---

# 74. Projection Updates

Projection consumers SHALL be idempotent.

---

# 75. Projection Freshness

Payload SHOULD record projection freshness where stale platform configuration could affect operation.

---

# 76. Event Loops

The architecture SHALL detect and prevent event feedback loops.

For example:

```text id="361oan"
Payload event
  ↓
Consumer update
  ↓
Payload update
  ↓
same event again
```

Causation metadata and authority boundaries SHOULD prevent uncontrolled loops.

---

# 77. Derived Updates

Where a consumer writes back to Payload as a legitimate consequence of an event, it SHALL identify the cause and avoid recreating the same semantic action indefinitely.

---

# 78. Event Version Compatibility

Consumers SHOULD support compatible event-version evolution where practical.

Breaking schema evolution SHALL follow contract governance.

---

# 79. Additive Evolution

Adding optional fields SHOULD be preferred over breaking existing consumers.

---

# 80. Breaking Evolution

Breaking event changes SHALL require:

- new schema version;
- compatibility window;
- consumer migration;
- explicit deprecation.

---

# 81. Schema Validation

Publishers and consumers SHOULD validate canonical event schema.

Malformed events SHALL not silently propagate.

---

# 82. Contract Compatibility Tests

CI SHALL verify Payload event producers against canonical schemas in `baobab-platform/shared`.

---

# 83. Consumer Compatibility Tests

Critical consumers SHOULD test against supported event versions.

---

# 84. Event Security

Events SHALL not contain secrets unless explicitly designed for secure secret transport, which ordinary canonical events are not.

---

# 85. Sensitive Content

Event payloads SHALL minimise sensitive or confidential content.

Consumers requiring full content SHOULD retrieve it through authorised APIs.

---

# 86. Tenant Isolation

Transport and consumer logic SHALL preserve tenant isolation.

Tenant A events SHALL not result in Tenant B state mutation.

---

# 87. Event Authorisation

Receiving an event does not itself grant a consumer unrestricted access to the referenced entity.

Consumers SHALL use only their authorised capabilities.

---

# 88. Auditability

Canonical event publication SHOULD be traceable to the originating:

- actor or service;
- operation;
- canonical entity;
- tenant;
- correlation chain.

---

# 89. Observability

Eventing telemetry SHOULD include:

- outbox backlog;
- publication latency;
- publish failure rate;
- retry count;
- dead-letter count;
- consumer lag where observable;
- event throughput.

---

# 90. Alerting

Operational alerts SHOULD be defined for:

- growing outbox backlog;
- prolonged publish failures;
- persistent dead-letter events;
- consumer processing failure;
- schema incompatibility.

---

# 91. Health Checks

Publisher health SHOULD distinguish:

```text id="w8tg1h"
application healthy
```

from:

```text id="n7eddq"
event publication degraded
```

where appropriate.

---

# 92. Backpressure

The publisher and consumers SHALL tolerate temporary backlog.

They SHALL avoid overwhelming downstream services during recovery.

---

# 93. Rate Limiting

Webhook and external integration publication MAY use rate limiting where necessary.

---

# 94. Bulk Content Operations

Bulk publication may generate many events.

The system SHALL support controlled batching or streaming without losing per-entity identity.

---

# 95. Import Events

Bulk imports SHALL deliberately define whether they:

- emit ordinary lifecycle events;
- emit import-specific events;
- suppress and reconcile afterward.

Silent inconsistency is prohibited.

---

# 96. Migration Events

Schema/data migrations SHALL not accidentally flood downstream consumers with misleading business events.

Migration event behaviour SHALL be explicit.

---

# 97. Bootstrap

When bringing a new consumer online, the preferred approach MAY be:

```text id="ab54ps"
authoritative snapshot
+
events from checkpoint
```

rather than replaying unbounded history.

---

# 98. Snapshot

Snapshots are projections and SHALL not become new authority.

---

# 99. Reconciliation

Event reliability SHALL be reinforced with periodic reconciliation.

Events are not a substitute for verifying final cross-system state.

---

# 100. Reconciliation Examples

Reconciliation SHOULD detect:

- published Payload content missing from search;
- stale digital-estate caches where observable;
- product-content mappings with missed updates;
- unpublished content still exposed downstream.

---

# 101. Event Loss Recovery

Where missed events are suspected, consumers SHALL be able to rebuild from authoritative state or replay.

---

# 102. Outbox Recovery

Publisher restart SHALL resume unpublished outbox work without losing events.

---

# 103. Worker Crash

A crash after transport publication but before local acknowledgement may cause duplicate delivery.

Consumers SHALL tolerate this.

---

# 104. Poison Events

An event that consistently fails because of invalid data SHALL not block unrelated events indefinitely.

It SHALL move to an intervention path.

---

# 105. Transport Neutrality

Canonical event contracts SHALL remain conceptually independent of a specific message broker.

Possible transports may evolve without redefining event semantics.

---

# 106. Broker Selection

The exact broker or managed event service MAY be decided separately by infrastructure architecture.

This ADR governs publication semantics, not vendor selection.

---

# 107. Local Development

Local development SHALL provide a practical mechanism to test:

- outbox creation;
- publishing;
- duplicate delivery;
- retries;
- consumer idempotency.

---

# 108. Testability

Event publishers and consumers SHOULD be testable without requiring the entire platform to run.

---

# 109. Rejected Alternative: Direct Synchronous Integration in Hooks

Rejected because it couples editorial transactions to remote service availability.

---

# 110. Rejected Alternative: Best-Effort Fire-and-Forget

Rejected because event loss would be invisible and unrecoverable.

---

# 111. Rejected Alternative: Distributed ACID Across Engines

Rejected because it undermines engine independence and is operationally unsuitable.

---

# 112. Rejected Alternative: Payload Hooks as Public Contract

Rejected because hooks are implementation-specific.

---

# 113. Rejected Alternative: Exactly-Once Dependence

Rejected because end-to-end correctness must still handle retries and duplicates.

---

# 114. Rejected Alternative: Full Payload Document in Every Event

Rejected due to coupling, payload size and data-governance concerns.

---

# 115. Rejected Alternative: Event Type Per Collection Hook

Rejected because event semantics must describe platform meaning, not CMS internals.

---

# 116. Rejected Alternative: Consumer-Specific Events from Core Content Logic

Rejected because producers should not be tightly aware of downstream consumers.

---

# 117. Consequences

## 117.1 Positive

This decision provides:

- durable event publication;
- independent engine availability;
- replayability;
- observable failures;
- consumer decoupling;
- idempotent integration;
- contract governance;
- support for new consumers without core CMS rewrites.

## 117.2 Negative

The architecture introduces:

- outbox persistence;
- background publishers;
- duplicate-delivery handling;
- retry policies;
- operational monitoring;
- event-schema governance;
- reconciliation.

These costs are accepted.

---

# 118. Architectural Invariants

1. Canonical events are platform contracts.
2. Payload hooks are implementation mechanisms.
3. Cross-platform event schemas belong in `baobab-platform/shared`.
4. Canonical events use stable canonical identity.
5. Tenant context is explicit.
6. Content mutation and durable event intent are transactionally coupled where possible.
7. Remote consumers do not participate in Payload database transactions.
8. At-least-once delivery is assumed.
9. Consumers are idempotent.
10. Global event ordering is not assumed.
11. Duplicate delivery is tolerated.
12. Out-of-order delivery is tolerated where applicable.
13. Publication failure is observable.
14. Repeated failure enters an intervention path.
15. Events are replayable where practical.
16. Large binaries are not embedded in ordinary events.
17. Webhooks do not define canonical domain semantics.
18. Slow webhook endpoints do not block editorial transactions.
19. New consumers do not require direct coupling to Payload persistence.
20. Events do not silently bypass tenant isolation.
21. Schema evolution is versioned.
22. Contract compatibility is CI-tested.
23. Events do not replace reconciliation.
24. Transport vendor does not define event semantics.
25. Event feedback loops are prevented.
26. Migration/import event behaviour is explicit.

---

# 119. Required Conformance Tests

## CT-001 — Atomic Outbox

A successful content mutation creates its required outbox record in the same successful transaction.

## CT-002 — Transaction Rollback

A failed content transaction does not leave a canonical event claiming the change succeeded.

## CT-003 — Publisher Restart

Pending events survive process restart.

## CT-004 — Duplicate Delivery

Delivering the same event twice does not create duplicate semantic state in an idempotent consumer.

## CT-005 — Consumer Unavailable

Content publication can succeed while a non-critical downstream consumer is temporarily unavailable.

## CT-006 — Retry

Transient delivery failure is retried according to policy.

## CT-007 — Dead Letter

Persistent failure becomes visible rather than disappearing.

## CT-008 — Canonical Identity

Canonical events use canonical entity IDs rather than Payload IDs as platform identity.

## CT-009 — Tenant Isolation

Tenant A events cannot mutate Tenant B projections.

## CT-010 — Webhook Timeout

A slow webhook does not indefinitely block the editorial transaction.

## CT-011 — Schema Validation

Invalid event payloads are rejected before normal publication or processing.

## CT-012 — Version Compatibility

Supported consumer versions continue to process compatible event evolution.

## CT-013 — Out-of-Order Delivery

A consumer does not overwrite newer entity state with a known older event.

## CT-014 — Replay Safety

Replay does not create prohibited duplicate external side effects.

## CT-015 — Event Loop

A content integration flow does not create uncontrolled recursive events.

## CT-016 — Binary Exclusion

Media events reference assets rather than embedding large binary content.

## CT-017 — Reconciliation

Missed downstream state can be detected and repaired independently of event history.

---

# 120. Implementation Direction

A suitable implementation boundary MAY resemble:

```text id="h4d0pi"
src/
└── baobab/
    ├── events/
    │   ├── canonical/
    │   ├── envelope/
    │   ├── publisher/
    │   ├── consumers/
    │   ├── validation/
    │   └── idempotency/
    │
    ├── outbox/
    │   ├── repository/
    │   ├── dispatcher/
    │   ├── retry/
    │   └── dead-letter/
    │
    ├── webhooks/
    │   ├── signing/
    │   ├── delivery/
    │   └── validation/
    │
    ├── context/
    ├── mappings/
    └── observability/
```

Exact package layout is non-normative.

The durable publication boundary is normative.

---

# 121. Decision Outcome

Payload SHALL participate in Baobab's event-driven architecture without making editorial transactions depend on synchronous availability of every downstream system.

The governing model is:

```text id="4pk44m"
                   PAYLOAD CONTENT CHANGE
                           │
                           ▼
                   Database Transaction
                           │
                 ┌─────────┴─────────┐
                 │                   │
                 ▼                   ▼
             Content              Outbox
                                      │
                                      ▼
                               Event Publisher
                                      │
                                      ▼
                              Canonical Event
                                      │
               ┌──────────────────────┼──────────────────────┐
               ▼                      ▼                      ▼
          Digital Estates         Search                Other Engines
               │                      │                      │
               └──────────────────────┼──────────────────────┘
                                      ▼
                               Reconciliation
```

The governing rule is:

> **Commit business state and the durable intent to announce it together; deliver asynchronously, consume idempotently, observe failures, and reconcile final state.**

This preserves Payload's independence while allowing the rest of Baobab to react reliably to content lifecycle changes.