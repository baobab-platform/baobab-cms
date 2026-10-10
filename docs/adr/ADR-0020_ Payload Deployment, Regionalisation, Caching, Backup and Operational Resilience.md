# ADR-0020: Payload Deployment, Regionalisation, Caching, Backup and Operational Resilience

**Status:** Accepted  
**Date:** 2026-09-04  
**Decision Class:** Platform Architecture / Operations / Resilience  
**Scope:** Baobab Content Engine  
**Repository:** `baobab-platform/baobab-cms`  
**Parent ADRs:**  
- `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`
- `ADR-0012-payload-multi-tenancy-and-content-isolation-architecture.md`
- `ADR-0014-payload-digital-estate-market-locale-and-content-inheritance.md`
- `ADR-0016-payload-media-asset-storage-and-delivery-architecture.md`
- `ADR-0018-payload-canonical-events-webhooks-transactional-outbox-and-integration-reliability.md`
- `ADR-0019-payload-content-schema-governance-versioning-and-migration.md`

**Related Systems:** Baobab Control Plane, `baobab-platform/shared`, `baobab-platform/infrastructure`, `baobab-platform/baobab-dev`, object storage, PostgreSQL, digital estates  
**Supersedes:** None  
**Architectural Style:** Independently deployable, region-aware, cache-safe, recoverable, observable and policy-driven

---

# 1. Context

The Baobab Content Engine must operate as a production-grade component within a wider polyrepo and polyglot platform.

Payload CMS is not an embedded library inside one website.

It is an independently deployable engine that may serve:

- multiple tenants;
- multiple legal entities;
- multiple digital estates;
- multiple markets;
- multiple locales;
- multiple deployment regions;
- multiple runtime instances.

The Content Engine therefore requires explicit operational architecture for:

- deployment;
- scaling;
- regionalisation;
- failover;
- caching;
- backup;
- restore;
- disaster recovery;
- reconciliation;
- observability;
- operational isolation.

This ADR establishes those operational boundaries.

---

# 2. Problem Statement

Without explicit operational architecture, several dangerous assumptions may emerge.

For example:

```text
one Payload server
=
one tenant
```

or:

```text
market
=
deployment region
```

or:

```text
cache key
=
URL
```

or:

```text
database backup
=
complete CMS backup
```

These assumptions are incorrect for Baobab.

A production Content Engine must survive:

- process restarts;
- instance replacement;
- dependency degradation;
- regional disruption;
- database recovery;
- media-storage recovery;
- deployment rollback;
- cache corruption;
- schema migration;
- event-processing backlog.

The operational model must preserve all architectural invariants established in ADR-0011 through ADR-0019.

---

# 3. Decision

Baobab SHALL deploy Payload as an **independently scalable, region-aware Content Engine whose runtime topology is governed by Control Plane context and IsolationProfile policy**.

The architecture SHALL conceptually separate:

```text
Canonical Context
       │
       ▼
Isolation Profile
       │
       ▼
Engine Instance Selection
       │
       ▼
Payload Runtime
       │
       ├── PostgreSQL
       ├── Object Storage
       ├── Event Publisher
       ├── Cache
       └── Observability
```

Deployment topology SHALL NOT redefine business identity.

---

# 4. Independent Deployment

The Content Engine SHALL be independently:

- versioned;
- built;
- deployed;
- scaled;
- monitored;
- rolled back;
- upgraded.

A Payload release SHALL not require simultaneous deployment of every digital estate or engine when contracts remain compatible.

---

# 5. Engine Registration

Each deployed Payload runtime SHALL correspond to a registered Baobab `EngineInstance` where applicable.

The Control Plane SHALL remain authoritative for:

- engine identity;
- engine-instance identity;
- lifecycle;
- capability binding;
- isolation profile;
- deployment context.

---

# 6. Engine Instance Is Not Tenant

An engine instance MAY serve:

- one tenant;
- several tenants;
- one region;
- several markets;
- multiple digital estates.

Therefore:

```text
engine_instance != tenant
```

---

# 7. Tenant Is Not Deployment

Tenant identity SHALL survive movement between Payload deployments.

Migration from:

```text
Shared Engine Instance
```

to:

```text
Dedicated Engine Instance
```

SHALL not require changing canonical tenant identity.

---

# 8. IsolationProfile

Deployment topology SHALL be driven by `IsolationProfile`.

An isolation profile MAY require:

- shared runtime;
- dedicated runtime;
- shared database;
- dedicated database;
- dedicated storage;
- dedicated encryption;
- regional pinning;
- stronger networking;
- stricter backup policy.

---

# 9. Default Topology

The initial preferred topology MAY use:

```text
shared Payload application runtime
+
explicit logical tenant isolation
+
shared infrastructure where authorised
```

while retaining the ability to move selected tenants to stronger physical isolation.

---

# 10. No Permanent Shared-Only Assumption

The application SHALL NOT assume that all tenants always share:

- the same database;
- the same storage;
- the same runtime;
- the same region.

---

# 11. No Permanent Dedicated-Only Assumption

Likewise, Baobab SHALL NOT require one full CMS deployment per tenant as a universal rule.

---

# 12. Stateless Application Runtime

Payload application instances SHOULD be treated as stateless or replaceable wherever practical.

Persistent state SHALL reside in approved durable systems.

---

# 13. No Local Persistent Content

Production content SHALL NOT depend on container-local files.

---

# 14. Runtime Replacement

Replacing a failed application instance SHALL not require restoring editorial content from that instance.

---

# 15. Horizontal Scaling

Payload SHOULD support horizontal scaling of stateless application instances where workload requires it.

---

# 16. Session Considerations

If administrative sessions require shared state, they SHALL use a deployment-safe mechanism.

Sticky sessions SHALL not become a hidden correctness dependency unless explicitly justified.

---

# 17. Background Work

Background tasks such as:

- scheduled publication;
- outbox publishing;
- reconciliation;
- media processing;

SHALL be coordinated so that horizontal scale does not cause uncontrolled duplicate execution.

Idempotency remains mandatory.

---

# 18. Leader Election

Where a task must execute only once, the system MAY use:

- distributed locking;
- queue semantics;
- database coordination;
- orchestration primitives.

The exact mechanism is implementation-specific.

---

# 19. Database Authority

Payload operational content state SHALL reside in its own database boundary.

No other engine SHALL directly query or mutate Payload tables.

---

# 20. PostgreSQL

Where supported by the chosen Payload architecture, PostgreSQL SHOULD be used as the Content Engine's relational database.

Database design SHALL preserve:

- tenant isolation;
- migration safety;
- backup;
- replication;
- failover;
- observability.

---

# 21. Shared Database Topology

A shared database MAY support multiple tenants under logical isolation where permitted by IsolationProfile.

---

# 22. Dedicated Database Topology

Selected tenants or instances MAY receive dedicated databases.

The application SHALL support both without changing canonical content semantics.

---

# 23. Database Connection Isolation

Connection configuration SHALL be engine-instance specific.

Credentials SHALL not be embedded in content schema or repository source.

---

# 24. Connection Pooling

Database connection pooling SHOULD be configured according to workload and deployment scale.

Application replicas SHALL not exhaust PostgreSQL connection capacity.

---

# 25. Read Replicas

Read replicas MAY be introduced for read-heavy workloads where application consistency requirements permit.

---

# 26. Read-After-Write

Operations requiring immediate consistency SHALL not unknowingly read from lagging replicas.

---

# 27. Regionalisation

The Content Engine MAY operate in multiple regions.

Regionalisation SHALL support:

- latency;
- residency;
- availability;
- operational isolation.

---

# 28. Region Is Not Market

The platform SHALL preserve:

```text
region != market
```

A market may span several technical regions.

A region may serve several markets.

---

# 29. Region Is Not Tenant

Likewise:

```text
region != tenant
```

---

# 30. Regional Routing

Routing to a Payload instance SHALL derive from trusted platform/infrastructure configuration.

It SHALL not be inferred solely from:

- hostname;
- locale;
- country;
- market label.

---

# 31. Data Residency

Residency policy MAY constrain:

- database location;
- object-storage location;
- backup location;
- replication destination;
- log storage.

These requirements SHALL be expressible through deployment/isolation policy.

---

# 32. Residency Versus Performance

Performance optimisation SHALL not override residency policy.

---

# 33. Multi-Region Write Model

The Content Engine SHALL NOT assume unrestricted active-active writes across regions.

Write topology SHALL be explicitly designed.

---

# 34. Preferred Initial Write Model

A simpler initial architecture SHOULD prefer a clearly authoritative write region or database authority per deployment boundary unless requirements justify multi-writer complexity.

---

# 35. Multi-Region Evolution

If true active-active content writes are later required, a dedicated ADR SHOULD define:

- conflict resolution;
- replication semantics;
- ordering;
- identity;
- consistency.

---

# 36. Regional Failover

Failover SHALL preserve:

- canonical identities;
- tenant context;
- mappings;
- publication state;
- event semantics.

---

# 37. Failover Does Not Create New Content Identity

Moving service execution to another region SHALL not create new canonical entities.

---

# 38. Engine Instance Migration

When content moves from one Payload EngineInstance to another:

- canonical identity SHALL remain stable;
- old ExternalReferences SHALL be retired or closed;
- new ExternalReferences SHALL be registered;
- mappings SHALL remain auditable.

---

# 39. Deployment Environments

At minimum, the Content Engine SHOULD support clearly separated:

```text
development
test
staging
production
```

or equivalent environments.

---

# 40. Environment Isolation

Production SHALL not share mutable content databases or credentials with development/test environments.

---

# 41. Reproducible Development

Development SHOULD use the organisation's approved `baobab-dev` Codespaces/DevContainer profile.

Environment setup SHALL be reproducible.

---

# 42. Reproducible Builds

Production builds SHALL be reproducible from repository state, lockfiles and pinned dependencies.

---

# 43. Container Images

The Content Engine SHOULD be packaged as a versioned immutable container image.

Runtime containers SHALL not modify application source.

---

# 44. Image Provenance

Container images SHOULD be traceable to:

- source revision;
- build workflow;
- version;
- dependency set.

---

# 45. CI/CD

GitHub Actions workflows SHALL comply with organisation security standards, including full commit-SHA pinning for third-party actions where required by repository policy.

---

# 46. Build Pipeline

CI SHOULD include:

- linting;
- type checking;
- unit tests;
- integration tests;
- contract tests;
- migration tests;
- security scanning;
- dependency scanning;
- container scanning.

---

# 47. Contract Compatibility Gate

Deployment SHALL be blocked where the Payload release breaks mandatory contracts without an approved compatibility strategy.

---

# 48. Migration Gate

A release requiring schema migration SHALL verify migration readiness before production deployment.

---

# 49. Deployment Strategy

Deployments SHOULD use a controlled strategy such as:

- rolling;
- blue-green;
- canary;

depending on infrastructure capability and risk.

---

# 50. Zero-Downtime Preference

Non-breaking releases SHOULD target zero or minimal downtime.

---

# 51. Schema Compatibility During Rolling Deployment

Rolling deployments SHALL respect ADR-0019 expand-and-contract principles.

Old and new instances may temporarily coexist.

---

# 52. Health Checks

The application SHALL expose meaningful health status.

Health SHOULD distinguish:

- process health;
- database dependency;
- storage dependency;
- eventing degradation;
- critical configuration validity.

---

# 53. Liveness

Liveness failure SHOULD indicate the process needs restart.

---

# 54. Readiness

Readiness SHOULD indicate whether an instance can safely receive traffic.

---

# 55. Dependency Degradation

Not every degraded dependency requires the application to be marked completely dead.

For example:

```text
event publisher degraded
```

may not imply:

```text
content read unavailable
```

---

# 56. Graceful Shutdown

Application instances SHOULD stop accepting new work and complete or safely abandon in-flight operations during shutdown.

---

# 57. Scheduled Publishing

Scheduled publication SHALL remain correct across:

- multiple instances;
- restarts;
- deployments;
- region failover.

---

# 58. Time

Scheduled operations SHALL use reliable time semantics.

Timestamps SHOULD be stored in an unambiguous canonical form.

Presentation timezone belongs to user/context display.

---

# 59. Cache Architecture

Caching SHALL be treated as an optimisation.

The authoritative source remains Payload persistence and associated canonical platform state.

---

# 60. Cache Layers

Caching MAY occur at:

- process level;
- distributed application cache;
- API gateway;
- CDN;
- digital estate;
- browser.

Each layer SHALL preserve context isolation.

---

# 61. Context-Aware Cache Key

Any cached resolved content SHALL include all dimensions that can affect the result.

Conceptually:

```text
tenant
legal_entity?
digital_estate
market?
locale?
canonical_entity/content_key
publication mode
policy version
```

as applicable.

---

# 62. Tenant Cache Isolation

A cache key missing tenant context for tenant-scoped content is invalid.

---

# 63. Estate Cache Isolation

Estate-specific content SHALL not leak through shared cache keys.

---

# 64. Market Cache Isolation

Market-specific content SHALL not be cached as if universally applicable.

---

# 65. Locale Cache Isolation

Locale-specific content SHALL include locale in the effective cache identity.

---

# 66. Preview Cache Isolation

Draft or preview content SHALL not enter public caches.

---

# 67. Authenticated Cache Isolation

Private or actor-specific content SHALL use appropriately partitioned caching or no shared cache.

---

# 68. Cache Invalidation

Cache invalidation SHOULD be driven by content lifecycle and policy changes.

ADR-0018 canonical events MAY trigger invalidation.

---

# 69. Broader-Scope Invalidation

A tenant-level content change MAY require invalidating many inherited estate/market/locale resolutions.

---

# 70. Narrow-Scope Invalidation

An estate-specific change SHOULD avoid purging unrelated tenants or estates where practical.

---

# 71. Policy Invalidation

Changes to:

- inheritance rules;
- locale fallback;
- market policy;
- capability binding;

MAY invalidate cached content even when the content record itself did not change.

---

# 72. TTL

Time-to-live MAY be used as a secondary safety mechanism.

TTL SHALL not replace event-driven invalidation where prompt consistency is required.

---

# 73. Cache Stampede

High-traffic cache misses SHOULD be protected from uncontrolled stampede where necessary.

---

# 74. Stale-While-Revalidate

Public low-risk content MAY use stale-while-revalidate strategies where acceptable.

---

# 75. Sensitive Content

Strictly regulated, private or highly time-sensitive content SHOULD use more conservative caching.

---

# 76. No Cache Authority

Cache contents SHALL never be treated as the only durable copy.

---

# 77. Cache Flush Safety

Flushing all caches SHALL not destroy business state.

---

# 78. CDN

Public content and media MAY use CDN delivery.

CDN configuration SHALL respect ADR-0016 media-access semantics.

---

# 79. Static Generation

Digital estates MAY statically generate pages from Payload content.

Static artefacts SHALL remain projections.

---

# 80. Revalidation

Static or cached digital-estate output SHOULD be revalidated from canonical content events or appropriate TTL policy.

---

# 81. Backup Scope

A complete Content Engine backup strategy SHALL include all durable state necessary for recovery.

At minimum, this may include:

- PostgreSQL content data;
- Payload configuration state where persisted;
- object-storage media;
- mappings/projections owned locally;
- outbox state where required;
- audit state where required.

---

# 82. Source Code Is Not Backup

Git repository history SHALL not be treated as backup of production content.

---

# 83. Database Backup Is Not Full CMS Backup

Database backup without object-storage recovery may be incomplete.

---

# 84. Media Backup

Media/object-store backup SHALL align with ADR-0016.

---

# 85. Backup Frequency

Backup frequency SHALL be derived from Recovery Point Objective.

---

# 86. Recovery Point Objective

Each production topology SHOULD define an RPO.

RPO determines maximum acceptable data loss window.

---

# 87. Recovery Time Objective

Each production topology SHOULD define an RTO.

RTO determines acceptable restoration duration.

---

# 88. Tenant-Specific RPO/RTO

Higher-value or regulated tenants MAY require stricter RPO/RTO under their isolation profile or service tier.

---

# 89. Backup Encryption

Backups SHALL be encrypted appropriately.

---

# 90. Backup Access

Backup access SHALL follow least privilege.

---

# 91. Backup Location

Backup location SHALL comply with residency policy.

---

# 92. Cross-Region Backup

Cross-region backups MAY be used where permitted.

They SHALL not violate residency constraints.

---

# 93. Backup Immutability

Critical backups SHOULD support immutability or protection from accidental/ransomware-style modification where infrastructure supports it.

---

# 94. Backup Retention

Retention periods SHALL be explicitly defined.

---

# 95. Restore Testing

Backups SHALL be tested through actual restoration procedures.

A backup never tested for restore SHALL not be assumed recoverable.

---

# 96. Restore Environment

Restore tests SHOULD occur in an isolated environment.

---

# 97. Restore Validation

Post-restore validation SHALL verify:

- content counts;
- tenant ownership;
- canonical identity;
- relationships;
- publication state;
- media availability;
- mapping consistency;
- outbox/event consistency.

---

# 98. Point-in-Time Recovery

Where database infrastructure supports it, point-in-time recovery SHOULD be considered for production.

---

# 99. Logical Tenant Restore

Where feasible, the architecture SHOULD support recovering or exporting one tenant without exposing unrelated tenants.

---

# 100. Shared Database Recovery Complexity

Shared logical tenancy makes selective restoration more complex.

This complexity SHALL be considered when assigning IsolationProfile.

---

# 101. Dedicated Tenant Recovery

Dedicated databases/storage may simplify tenant-specific restoration where stronger isolation is justified.

---

# 102. Disaster Recovery

The Content Engine SHALL maintain a documented disaster-recovery procedure.

---

# 103. Disaster Scenarios

DR planning SHOULD consider:

- application image failure;
- database failure;
- object-store loss;
- regional outage;
- configuration corruption;
- credential compromise;
- bad deployment;
- bad migration;
- event backlog.

---

# 104. Application Failure

Application failure should normally be resolved by deploying healthy immutable instances.

---

# 105. Database Failure

Database recovery SHALL follow approved database HA/backup mechanisms.

---

# 106. Object Storage Failure

Media recovery SHALL follow ADR-0016 storage and backup design.

---

# 107. Region Failure

Regional failure SHALL trigger failover according to configured deployment policy.

---

# 108. Bad Deployment

A bad application deployment SHOULD support rollback where data compatibility permits.

---

# 109. Bad Migration

Bad schema/data migration SHALL follow ADR-0019 recovery or forward-fix strategy.

---

# 110. Event Backlog

Event transport failure SHALL not require restoring content state if the outbox remains durable.

---

# 111. Reconciliation After Recovery

Every significant recovery event SHALL be followed by reconciliation.

---

# 112. Reconciliation Scope

Operational reconciliation SHALL include:

- database versus mappings;
- Payload versus canonical identity;
- database versus object storage;
- outbox versus publication state;
- published content versus search/index projections;
- active engine instance versus Control Plane registration.

---

# 113. Startup Reconciliation

Selected lightweight reconciliation MAY run during startup.

Heavy reconciliation SHOULD run asynchronously.

---

# 114. Scheduled Reconciliation

Periodic reconciliation SHOULD be scheduled for critical cross-system relationships.

---

# 115. Self-Healing

Safe deterministic inconsistencies MAY be repaired automatically.

---

# 116. Human Intervention

Ambiguous or destructive inconsistencies SHALL require operator review.

---

# 117. Observability

Payload SHALL expose sufficient telemetry for production operation.

This SHOULD include:

- structured logs;
- metrics;
- traces;
- health status;
- audit events.

---

# 118. Structured Logging

Logs SHOULD include, where applicable:

- timestamp;
- engine;
- engine instance;
- tenant;
- digital estate;
- correlation ID;
- trace ID;
- operation;
- outcome.

---

# 119. Sensitive Logging

Logs SHALL not expose:

- passwords;
- secrets;
- private keys;
- sensitive tokens;
- unnecessary confidential content.

---

# 120. Metrics

Operational metrics SHOULD include:

- request rate;
- error rate;
- latency;
- database latency;
- connection-pool saturation;
- cache hit/miss;
- storage errors;
- outbox backlog;
- migration state;
- reconciliation failures.

---

# 121. Tenant-Aware Metrics

Where feasible, operational consumption MAY be attributable to tenant without exposing excessive cardinality or sensitive identifiers.

---

# 122. Tracing

Distributed tracing SHOULD propagate correlation across:

```text
Digital Estate
      ↓
Content Engine
      ↓
Mapping Resolver
      ↓
Storage/Event systems
```

where technically practical.

---

# 123. Alerting

Alerts SHOULD focus on actionable conditions such as:

- sustained error rate;
- unavailable database;
- outbox backlog growth;
- failed backup;
- failed restore test;
- excessive cache failure;
- reconciliation anomalies;
- storage access failure.

---

# 124. SLOs

Production service levels SHOULD eventually define measurable objectives for:

- availability;
- latency;
- recovery;
- publication propagation.

---

# 125. Capacity Planning

Capacity planning SHALL consider:

- content volume;
- tenant count;
- media storage;
- editorial concurrency;
- API read traffic;
- event throughput;
- regional distribution.

---

# 126. Autoscaling

Runtime autoscaling MAY use:

- CPU;
- memory;
- request rate;
- latency;
- queue depth;

where infrastructure supports it.

---

# 127. Database Scaling

Application autoscaling SHALL not ignore database bottlenecks.

---

# 128. Storage Scaling

Object-storage capacity SHALL be monitored independently from Payload application capacity.

---

# 129. Cost Attribution

Infrastructure cost SHOULD eventually be attributable by:

- engine instance;
- tenant;
- region;
- storage consumption;
- traffic;

where business needs justify it.

---

# 130. Maintenance

Routine maintenance SHALL include:

- dependency updates;
- database maintenance;
- certificate rotation;
- secret rotation;
- backup verification;
- reconciliation;
- security patching.

---

# 131. Maintenance Isolation

Maintenance on one tenant's dedicated instance SHOULD not unnecessarily affect unrelated tenants.

---

# 132. Security Patching

Critical vulnerabilities SHOULD be patchable without redesigning content architecture.

---

# 133. Secret Rotation

Rotating:

- database credentials;
- storage credentials;
- webhook secrets;
- service tokens;

SHALL not require editing content records.

---

# 134. Dependency Failure Isolation

Failure of:

- search;
- analytics;
- downstream webhook;
- optional cache;

SHOULD not necessarily make core content persistence unavailable.

---

# 135. Core Dependency Classification

Dependencies SHALL be classified by whether they are:

- required for writes;
- required for reads;
- optional/degradable.

---

# 136. Fail Closed Versus Fail Open

Failure behaviour SHALL depend on risk.

Examples:

- tenant authorisation uncertainty → fail closed;
- CDN unavailable for public media → origin fallback MAY be acceptable;
- analytics unavailable → core content operation MAY continue.

---

# 137. No Silent Degradation

Degraded operation SHALL be observable.

---

# 138. Data Integrity Over Availability

Where serving content would violate tenant isolation or authorisation, the system SHALL prefer failure over unsafe availability.

---

# 139. Operational Runbooks

Production operation SHALL maintain runbooks for:

- deployment;
- rollback;
- migration;
- backup restore;
- regional failover;
- outbox recovery;
- cache purge;
- credential rotation;
- tenant migration.

---

# 140. Tenant Migration

Migration of a tenant between:

```text
shared
→
dedicated
```

or:

```text
region A
→
region B
```

SHALL preserve canonical identity and content semantics.

---

# 141. Tenant Migration Procedure

A migration SHOULD define:

1. target provisioning;
2. data copy;
3. media copy/reference strategy;
4. validation;
5. mapping update;
6. traffic cutover;
7. event reconciliation;
8. old-instance retirement.

---

# 142. Cutover

Cutover SHALL minimise split-brain writing.

---

# 143. Dual Write During Migration

Dual writes SHOULD be avoided unless explicitly designed and reconciled.

---

# 144. Read-Only Transition

A temporary read-only phase MAY be used during high-risk migration.

---

# 145. Canonical Mapping During Migration

Canonical entity identity SHALL remain stable while external references and EngineInstance mappings transition.

---

# 146. Instance Retirement

Retired Payload instances SHALL:

- stop accepting traffic;
- stop publishing new events;
- have mappings closed;
- have credentials revoked;
- retain data according to retention policy.

---

# 147. Tenant Offboarding

Offboarding SHALL include:

- access revocation;
- export where required;
- retention decision;
- media handling;
- mapping retirement;
- event handling;
- eventual deletion according to policy.

---

# 148. Data Deletion

Tenant deletion SHALL be deliberate and auditable.

It SHALL not be implemented as an ad hoc database script.

---

# 149. Regulatory Retention

Required retention MAY prevent immediate deletion after tenant offboarding.

---

# 150. Environment Parity

Development and staging SHOULD resemble production architecture enough to exercise:

- database integration;
- object storage;
- event outbox;
- tenancy;
- caching;
- migration.

Exact scale need not match production.

---

# 151. Local Simplification

Local development MAY simplify:

- regional routing;
- HA;
- CDN;
- managed services.

It SHALL preserve contractual semantics.

---

# 152. Chaos and Failure Testing

Critical resilience paths SHOULD eventually be tested under controlled failure such as:

- database restart;
- worker crash;
- event transport outage;
- cache loss;
- instance termination.

---

# 153. Restore Drills

Recovery drills SHOULD occur periodically.

---

# 154. Regional Failover Drills

Multi-region deployments SHOULD periodically validate failover procedures.

---

# 155. Operational Documentation

Deployment topology and operational procedures SHALL be documented in repository and infrastructure documentation.

---

# 156. Infrastructure Ownership

`baobab-platform/infrastructure` or its canonical successor SHOULD own:

- environment orchestration;
- deployment manifests;
- networking;
- secret integration;
- regional infrastructure;
- runtime policy.

---

# 157. Content Repository Ownership

`baobab-platform/baobab-cms` SHALL own:

- application image;
- runtime configuration contract;
- health endpoints;
- migrations;
- Payload-specific operational hooks;
- application-level observability.

---

# 158. Control Plane Ownership

The Control Plane SHALL own canonical knowledge of:

- engine;
- engine instance;
- capability binding;
- context;
- isolation profile;
- lifecycle.

---

# 159. Shared Ownership

`baobab-platform/shared` SHALL own cross-repository operational contracts where portability is required.

---

# 160. No Infrastructure Logic in Content Models

Payload collections SHALL not contain hard-coded assumptions such as:

```text
if market == "ZA":
    database = region_a
```

Infrastructure resolution belongs outside content modelling.

---

# 161. No Tenant-Specific Deployment Branching in Core Code

The application SHALL not contain:

```text
if tenant == "tenant-a":
    use dedicated server
```

Topology SHALL be configuration/policy driven.

---

# 162. Rejected Alternative: One Global Payload Instance Forever

Rejected because isolation, residency and scale requirements may diverge.

---

# 163. Rejected Alternative: One Payload Instance per Tenant by Definition

Rejected because it over-couples tenancy and deployment topology.

---

# 164. Rejected Alternative: Market Equals Region

Rejected because business-market semantics and infrastructure topology are different dimensions.

---

# 165. Rejected Alternative: Container Filesystem Persistence

Rejected because runtime instances are replaceable.

---

# 166. Rejected Alternative: URL-Only Cache Key

Rejected because tenant, estate, market and locale can affect resolution.

---

# 167. Rejected Alternative: Public Cache for Preview Content

Rejected because drafts/private data may leak.

---

# 168. Rejected Alternative: Database Backup Only

Rejected because complete recovery may also require media and other durable state.

---

# 169. Rejected Alternative: Untested Backups

Rejected because backup existence does not prove recoverability.

---

# 170. Rejected Alternative: Global Cache Flush as Normal Invalidation Strategy

Rejected as the default because it causes unnecessary load and weakens isolation efficiency.

---

# 171. Rejected Alternative: Distributed Active-Active Writes by Default

Rejected because conflict resolution and consistency complexity are unnecessary until requirements justify them.

---

# 172. Rejected Alternative: Infrastructure Configuration Embedded in Payload Collections

Rejected because infrastructure topology is not editorial content.

---

# 173. Rejected Alternative: Manual Production Deployments

Rejected as the normal model.

Production deployment SHALL be reproducible and auditable.

---

# 174. Consequences

## 174.1 Positive

This decision provides:

- independent deployment;
- horizontal scalability;
- tenant-flexible isolation;
- regionalisation;
- residency support;
- deterministic caching;
- recoverability;
- operational observability;
- engine-instance migration;
- failure isolation;
- production-grade runbooks.

## 174.2 Negative

The architecture introduces:

- deployment complexity;
- more infrastructure components;
- recovery testing;
- cache discipline;
- multi-region planning;
- isolation-profile management;
- operational reconciliation.

These costs are accepted.

---

# 175. Architectural Invariants

1. Payload is independently deployable.
2. EngineInstance is not synonymous with tenant.
3. Tenant is not synonymous with deployment.
4. Region is not synonymous with market.
5. Region is not synonymous with tenant.
6. IsolationProfile determines deployment strength.
7. Production runtime instances are replaceable.
8. Durable content is not stored on ephemeral container filesystems.
9. Other engines do not directly access Payload persistence.
10. Shared and dedicated database topologies are both supported conceptually.
11. Canonical identity survives engine-instance migration.
12. Multi-region active-active writes are not assumed.
13. Residency policy overrides performance convenience.
14. Builds are reproducible.
15. Deployment is automated and auditable.
16. Breaking schema migration respects ADR-0019.
17. Cache is never authoritative.
18. Cache keys contain all content-resolution dimensions that affect results.
19. Preview/private content cannot leak into public caches.
20. Cache invalidation responds to content and policy change.
21. Database backup alone is not assumed sufficient.
22. Restore procedures are tested.
23. RPO and RTO are explicit production properties.
24. Recovery is followed by reconciliation.
25. Event backlog does not imply loss where the outbox remains durable.
26. Tenant migration preserves canonical identity.
27. Infrastructure topology is configuration/policy driven.
28. Deployment logic is not embedded in editorial schemas.
29. Operational degradation is observable.
30. Unsafe authorisation uncertainty fails closed.

---

# 176. Required Conformance Tests

## CT-001 — Runtime Replacement

Destroying and recreating a Payload application container does not lose durable content.

## CT-002 — Shared Tenant Isolation

Two tenants on a shared runtime remain isolated.

## CT-003 — Dedicated Migration

A tenant can move from shared to dedicated topology without changing canonical content IDs.

## CT-004 — Regional Migration

Moving an engine representation between regions preserves canonical identity and mapping history.

## CT-005 — Cache Tenant Isolation

Tenant A's resolved content cannot be returned from Tenant B's cache key.

## CT-006 — Cache Estate Isolation

Estate A-specific content cannot leak to Estate B.

## CT-007 — Cache Locale Isolation

`en-ZA` content cannot be served for `sw-UG` through cache collision.

## CT-008 — Preview Safety

Draft/preview content is absent from public caches.

## CT-009 — Cache Loss

Complete cache loss does not destroy authoritative content.

## CT-010 — Application Rollback

A compatible application release can be rolled back without content loss.

## CT-011 — Backup Restore

A verified backup can restore database and media to a usable Content Engine state.

## CT-012 — Canonical Identity Restore

Restored records preserve canonical identity.

## CT-013 — Outbox Recovery

A publisher restart resumes pending event publication.

## CT-014 — Dependency Degradation

Failure of a non-critical analytics/search dependency does not necessarily prevent core editorial persistence.

## CT-015 — Region Failure

Configured failover does not weaken tenant isolation.

## CT-016 — Residency

A residency-restricted tenant cannot be transparently migrated or replicated to a prohibited region.

## CT-017 — Reconciliation

Post-recovery reconciliation detects missing mappings, media or projections.

## CT-018 — Reproducible Build

The same declared source/dependency state produces an equivalent deployable application artifact.

## CT-019 — Migration Compatibility

Rolling deployment with a compatible expand-and-contract migration supports old and new application instances for the intended transition window.

## CT-020 — Tenant Offboarding

Offboarding retires access and mappings without deleting data contrary to retention policy.

---

# 177. Implementation Direction

A suitable operational separation MAY resemble:

```text
baobab-platform/baobab-cms
├── src/
├── migrations/
├── tests/
├── Dockerfile
├── .devcontainer/
├── observability/
├── health/
└── docs/

baobab-platform/infrastructure
├── environments/
├── payload/
│   ├── deployment/
│   ├── networking/
│   ├── database/
│   ├── storage/
│   ├── cache/
│   ├── secrets/
│   ├── backup/
│   └── regionalisation/
└── monitoring/
```

Exact structure is non-normative.

The separation of application, infrastructure and Control Plane responsibilities is normative.

---

# 178. Operational Reference Model

The final operational model is:

```text
                         BAOBAB CONTROL PLANE
                                  │
                    Context + IsolationProfile
                                  │
                                  ▼
                         EngineInstance Binding
                                  │
                     ┌────────────┴────────────┐
                     │                         │
                     ▼                         ▼
                Region / Zone             Region / Zone
                     │                         │
                     ▼                         ▼
               Payload Runtime            Payload Runtime
                ┌────┼────┐                ┌────┼────┐
                │    │    │                │    │    │
                ▼    ▼    ▼                ▼    ▼    ▼
               DB  Cache Storage          DB  Cache Storage
                │         │                │         │
                └────┬────┘                └────┬────┘
                     │                         │
                     ▼                         ▼
                  Events                    Events
                     │                         │
                     └────────────┬────────────┘
                                  ▼
                         Digital Estates
```

Physical topology may vary.

Canonical content semantics SHALL not.

---

# 179. Decision Outcome

The Baobab Content Engine SHALL operate as a production-grade platform capability rather than as a CMS attached to one website.

Its operational architecture SHALL permit Baobab to:

- begin with economical shared infrastructure;
- introduce dedicated isolation where justified;
- serve multiple digital estates;
- support multiple regions;
- enforce residency;
- scale independently;
- recover from failure;
- migrate tenants;
- change deployment topology without changing canonical content identity.

The governing principle is:

> **Deployment topology is replaceable operational state; canonical context, ownership and identity are architectural state.**

Payload can therefore move between containers, databases, regions and infrastructure profiles while preserving the same tenant, digital estate, market, locale and canonical content semantics.