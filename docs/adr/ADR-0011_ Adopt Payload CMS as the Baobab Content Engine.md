# ADR-0011: Adopt Payload CMS as the Baobab Content Engine

**Status:** Accepted  
**Date:** 2026-09-02  
**Decision Class:** Platform Architecture / Content Management  
**Scope:** Baobab Platform  
**Repository:** `baobab-platform/baobab-cms`  
**Parent:** None — Parent ADR for the Baobab Content Engine  
**Preceded by:** `ADR-0010`  
**Related Engines:** Baobab Control Plane, Baobab Trade Engine, Baobab ERP Engine  
**Selected Technology:** Payload CMS  
**Architectural Style:** Headless, API-first, independently deployable, contract-driven, event-integrated, multi-tenant  

---

## 1. Context

The Baobab Platform is a polyrepo, polyglot enterprise platform composed of independently deployable engines, digital estates, shared organisational contracts, infrastructure services and a platform Control Plane.

The platform deliberately does not attempt to implement every enterprise capability within a single application.

Instead, specialised engines own clearly bounded operational domains while conforming to Baobab-wide contracts for:

- identity;
- tenancy;
- legal-entity identity;
- markets;
- digital estates;
- canonical identifiers;
- engine registration;
- capability discovery;
- events;
- APIs;
- observability;
- security;
- audit;
- integration;
- deployment; and
- lifecycle governance.

The platform already follows this model for commerce and ERP.

The same architectural discipline is required for content management.

Baobab requires a production-grade content capability capable of supporting multiple independent legal entities, brands, digital estates, countries, languages, markets and channels without coupling editorial content management to commerce, ERP or individual frontend implementations.

Content must therefore be treated as an independent enterprise capability.

---

## 2. Problem Statement

Baobab digital estates require management of content including:

- websites;
- landing pages;
- navigation;
- corporate information;
- campaigns;
- editorial product content;
- articles;
- news;
- market-specific content;
- legal and regulatory content;
- media;
- documents;
- SEO metadata;
- localisation;
- reusable content blocks;
- structured content;
- brand narratives;
- merchandising narratives;
- taxonomy;
- publication workflows; and
- scheduled publication.

This content cannot safely be owned by:

- MedusaJS;
- iDempiere;
- the Control Plane;
- individual frontend repositories; or
- a shared Baobab database.

Doing so would blur domain authority and create unnecessary coupling.

Baobab therefore requires a dedicated headless Content Engine.

---

## 3. Decision

Baobab SHALL adopt **Payload CMS** as the foundation of the **Baobab Content Engine**.

The Content Engine SHALL be implemented and operated as an independently deployable Baobab engine.

The canonical repository SHALL be:

```text
baobab-platform/baobab-cms
```

Payload CMS SHALL remain recognisable as an upstream product and SHALL NOT be transformed into a general-purpose Baobab application framework.

Baobab-specific behaviour SHALL be implemented through explicitly bounded:

- configuration;
- collections;
- globals;
- hooks;
- access-control policies;
- plugins;
- adapters;
- API extensions;
- event publishers;
- integration components; and
- contract implementations.

The architectural relationship SHALL be:

```text
                         BAOBAB PLATFORM
                                │
                 ┌──────────────┼──────────────┐
                 │              │              │
                 ▼              ▼              ▼
          Control Plane    Trade Engine     ERP Engine
                                │
                                │
                         MedusaJS / iDempiere
                                │
                 ┌──────────────┴──────────────┐
                 │                             │
                 ▼                             ▼
          Content Engine                 Other Engines
           Payload CMS
                 │
                 ▼
          Digital Estates
```

Payload CMS SHALL therefore provide content-management capabilities to Baobab consumers without becoming the authority for platform governance, commerce or ERP data.

---

# 4. Architectural Principles

## 4.1 Headless by Default

Payload SHALL operate as a headless content engine.

The CMS SHALL NOT own the presentation layer of individual digital estates.

Digital estates SHALL consume content through supported APIs and integration contracts.

The Content Engine SHALL therefore remain independent of:

- Next.js;
- React;
- Flutter;
- native mobile applications;
- kiosk applications;
- partner portals;
- future frontend frameworks; and
- other presentation technologies.

A digital estate MAY use any presentation technology capable of conforming to the Baobab contracts applicable to that estate.

---

## 4.2 Content Engine, Not Digital Estate

`baobab-cms` SHALL NOT be treated as a corporate website repository.

It SHALL provide content capabilities.

For example:

```text
baobab-platform/baobab-cms
        │
        ├── Nabhold content
        ├── Zuribeans content
        ├── Thamani content
        └── future estate content
```

does not imply that those organisations share ownership or visibility.

Their content SHALL remain isolated according to canonical Baobab context and isolation policies.

Individual digital estates remain independently deployable applications.

---

## 4.3 Standardise Contracts, Not Internal Implementation

Baobab SHALL standardise the Content Engine's externally observable contracts.

It SHALL NOT require other engines to understand Payload's internal database model.

Baobab-wide contracts SHALL govern:

- canonical identity;
- tenant context;
- legal-entity context;
- digital-estate context;
- market context;
- localisation context;
- API conventions;
- event envelopes;
- correlation identifiers;
- audit metadata;
- error representation;
- security;
- observability; and
- lifecycle metadata.

Payload-specific implementation details SHALL remain internal to `baobab-cms`.

---

# 5. Domain Authority

Payload CMS SHALL be authoritative for **editorial content**.

This includes, where applicable:

```text
Content Engine
│
├── Pages
├── Articles
├── News
├── Campaigns
├── Navigation
├── Media
├── Documents
├── Editorial Taxonomy
├── SEO Metadata
├── Brand Content
├── Product Storytelling
├── Marketing Descriptions
├── Merchandising Narratives
├── Localised Content
├── Market Content
├── Reusable Content Blocks
├── Publication State
└── Publication Scheduling
```

Payload SHALL NOT become authoritative for operational commerce or ERP data.

---

# 6. Commerce Authority Boundary

The Baobab Trade Engine based on MedusaJS remains authoritative for transactional commerce concepts.

Medusa SHALL own, among other things:

- commerce products;
- variants;
- SKUs;
- sellability;
- sales channels;
- transactional pricing;
- price lists;
- promotions;
- carts;
- orders;
- fulfilment;
- inventory-related commerce state;
- customer commerce state; and
- commerce transactions.

Payload MAY enrich a canonical product with editorial information.

For example:

```text
Canonical Product
      │
      ├───────────────┐
      │               │
      ▼               ▼
   Medusa           Payload
      │               │
Commerce State    Editorial State
      │               │
      ▼               ▼
variant           title
SKU               long description
price             storytelling
channel           media
sellability       SEO
promotion         editorial taxonomy
                  localisation
```

Neither engine SHALL directly manipulate the other's persistence model.

---

# 7. ERP Authority Boundary

The Baobab ERP Engine based on iDempiere remains authoritative for ERP and enterprise operational records assigned to its domain.

Payload SHALL NOT become authoritative for:

- accounting;
- general ledger;
- procurement transactions;
- supplier accounting;
- inventory valuation;
- receivables;
- payables;
- financial posting;
- ERP organisations;
- ERP warehouses;
- ERP business partners; or
- other operational ERP records.

Content referencing ERP concepts SHALL do so through canonical Baobab identifiers or explicit mappings.

Payload SHALL NOT use iDempiere database identifiers as Baobab identifiers.

---

# 8. Control Plane Authority Boundary

The Baobab Control Plane remains authoritative for platform-level metadata and lifecycle governance.

Payload SHALL NOT independently redefine:

- canonical tenants;
- legal entities;
- markets;
- digital estates;
- engines;
- engine instances;
- capabilities;
- capability bindings;
- canonical contexts;
- isolation profiles; or
- platform lifecycle state.

The Content Engine SHALL consume the relevant Control Plane representation.

Conceptually:

```text
Control Plane
     │
     │ canonical context
     ▼
Content Engine
     │
     │ content operation
     ▼
Payload
```

Payload may maintain local projections or mappings necessary for efficient operation.

Those projections SHALL NOT supersede Control Plane authority.

---

# 9. Canonical Identity

Payload-generated identifiers SHALL NOT become canonical Baobab identifiers merely because a record originates in Payload.

Baobab SHALL distinguish:

```text
Canonical ID
```

from:

```text
Payload Internal ID
```

Mappings SHALL use the Baobab Canonical Mapping Model.

Conceptually:

```text
CanonicalEntity
      │
      ▼
ExternalReference
      │
      ▼
Mapping
      │
      ▼
Payload Record
```

This permits:

- Payload replacement;
- data migration;
- multiple Payload instances;
- regional deployments;
- tenant-specific instances;
- temporary coexistence during migration; and
- historical reconciliation.

No externally exposed Baobab contract SHALL depend exclusively upon Payload's internal database identifier.

---

# 10. Multi-Tenancy

Payload SHALL conform to the Baobab tenancy architecture.

The following invariant remains fundamental:

> A legal entity is the default tenant boundary, but a legal entity is not synonymous with tenancy.

The Content Engine SHALL therefore NOT hard-code assumptions such as:

```text
tenant == company
```

or:

```text
one Payload installation == one tenant
```

Isolation SHALL instead derive from canonical Baobab context and `IsolationProfile`.

Possible deployment/isolation strategies MAY include:

- shared engine instance with logical isolation;
- dedicated engine instance;
- dedicated database;
- dedicated schema where supported by the implementation;
- dedicated regional deployment;
- dedicated infrastructure; or
- combinations thereof.

The selected isolation mechanism SHALL be policy-driven rather than embedded in business logic.

---

# 11. Market Architecture

Content SHALL support Baobab's market model.

A market SHALL NOT be reduced to a country.

A market may represent a commercially meaningful operating context involving combinations of:

- geography;
- currency;
- language;
- regulatory regime;
- customer segment;
- sales channel;
- legal entity;
- brand;
- digital estate; and
- commercial strategy.

Content MAY therefore be scoped to:

```text
Global
  ↓
Tenant
  ↓
Legal Entity
  ↓
Digital Estate
  ↓
Market
  ↓
Locale
```

where permitted by canonical scope rules.

The exact inheritance algorithm SHALL be defined by a child ADR.

---

# 12. Localisation

The Content Engine SHALL support multilingual and multi-regional content.

Localisation SHALL distinguish at minimum:

- language;
- locale;
- market;
- geography; and
- commercial context.

For example:

```text
en
en-ZA
en-UG
sw-UG
fr-CD
pt-AO
```

SHALL NOT automatically be assumed equivalent.

Fallback behaviour SHALL be explicit, deterministic and auditable.

A missing localised value SHALL NOT silently inherit from an unrelated market merely because the language is similar.

---

# 13. Digital Estate Model

Content SHALL be capable of being associated with a canonical `DigitalEstate`.

Examples may include:

```text
Nabhold corporate estate
Zuribeans B2B estate
Thamani B2C estate
future mobile estate
partner portal
campaign microsite
```

A Digital Estate SHALL NOT be inferred solely from:

- hostname;
- Payload collection;
- database;
- deployment name; or
- frontend repository.

The canonical identity SHALL originate from the Baobab platform model.

---

# 14. Content Composition

The Content Engine SHALL favour structured content over presentation-specific blobs.

Content models SHOULD represent semantic intent.

For example:

```text
Hero
CallToAction
Feature
ProductNarrative
Testimonial
Article
FAQ
Document
MarketNotice
LegalNotice
```

rather than embedding complete frontend implementations into content records.

The CMS SHALL NOT become a repository for arbitrary frontend code.

This preserves portability across digital estates and presentation technologies.

---

# 15. Media Authority

Payload SHALL own editorial metadata concerning managed media.

Binary storage MAY reside in Baobab-approved object storage rather than the application filesystem.

Production deployments SHALL NOT depend on ephemeral container-local storage for persistent media.

Media architecture SHALL support:

- tenant isolation;
- digital-estate scoping;
- access control;
- metadata;
- transformations;
- lifecycle management;
- retention;
- audit;
- CDN delivery;
- regional requirements; and
- future migration.

Object identity SHALL remain distinguishable from storage location.

---

# 16. API-First Integration

Digital estates and Baobab engines SHALL interact with Payload through supported APIs or explicit integration components.

Direct database access is prohibited.

The following SHALL NOT occur:

```text
Digital Estate ──SQL──> Payload Database
Medusa         ──SQL──> Payload Database
iDempiere      ──SQL──> Payload Database
Control Plane  ──SQL──> Payload Database
```

Permitted integration paths include:

```text
REST
GraphQL
approved internal APIs
events
webhooks
integration workers
canonical mapping services
```

All cross-engine integration SHALL remain observable and replaceable.

---

# 17. Event-Driven Integration

The Content Engine SHALL participate in the Baobab canonical event architecture.

Significant lifecycle transitions SHOULD emit events.

Examples include:

```text
content.created
content.updated
content.published
content.unpublished
content.archived

media.created
media.updated
media.archived

page.published

product-content.updated

navigation.updated
```

Canonical event naming SHALL ultimately conform to organisation-wide event contracts.

Payload-specific hook semantics SHALL NOT leak into canonical event definitions.

---

# 18. Transactional Outbox

Where a Payload operation produces an externally meaningful event, Baobab SHOULD use a transactional outbox or equivalent durability mechanism.

The target invariant is:

```text
content committed
        +
event intent committed
```

as one durable operation wherever technically achievable.

The system SHALL avoid designs where:

```text
Payload write succeeds
        ↓
network event fails
        ↓
platform permanently loses change notification
```

Event delivery SHALL support:

- retries;
- idempotency;
- correlation;
- causation;
- replay;
- observability; and
- reconciliation.

---

# 19. Idempotency

Consumers SHALL assume events may be delivered more than once.

Content integration handlers SHALL therefore be idempotent.

An event identity SHALL be sufficient for consumers to detect already-applied operations.

Baobab SHALL prefer:

```text
at-least-once delivery
+
idempotent consumers
```

over attempting to promise distributed exactly-once processing.

---

# 20. Product Content Integration

Payload and Medusa SHALL be integrated through canonical mapping rather than duplicated ownership.

A product relationship may conceptually be:

```text
CanonicalEntity: Product
        │
        ├── ExternalReference
        │       engine = MEDUSA
        │       external_id = ...
        │
        └── ExternalReference
                engine = PAYLOAD
                external_id = ...
```

The digital estate may then compose:

```text
Commerce Product
       +
Editorial Product Content
       +
Market Context
       +
Locale
       ↓
Customer Experience
```

The frontend SHALL NOT determine canonical equivalence by matching names, SKUs, slugs or other mutable attributes unless an explicitly governed contract defines such behaviour.

---

# 21. Content Slugs and URLs

A slug SHALL NOT be treated as canonical identity.

Slugs:

- may change;
- may differ by locale;
- may differ by market;
- may differ by digital estate;
- may require redirects;
- may be reused under different scopes.

Canonical content identity SHALL therefore remain independent of URL representation.

URL construction belongs to the relevant digital-estate contract.

---

# 22. Access Control

Payload access control SHALL enforce Baobab context.

Authorisation SHALL consider, as applicable:

```text
Actor
Tenant
Legal Entity
Digital Estate
Market
Locale
Capability
Role
Permission
Resource
Operation
Isolation Profile
```

Authentication alone SHALL NOT imply content access.

Administrative access SHALL NOT automatically confer cross-tenant access.

Platform operators with elevated cross-tenant privileges SHALL use explicitly governed administrative capabilities.

---

# 23. Administrative Interface

Payload's administrative interface MAY be used for editorial operations.

Baobab SHALL NOT unnecessarily reproduce mature Payload editorial capabilities in a separate Control Plane UI.

The separation is:

```text
Payload Admin
    ↓
Content administration

Baobab Control Plane
    ↓
Platform administration
```

The Control Plane SHALL manage concepts such as:

- engine registration;
- engine instances;
- tenant capability enablement;
- isolation;
- integration configuration;
- platform health;
- canonical mappings; and
- lifecycle governance.

Payload Admin SHALL manage content.

---

# 24. Authentication and Identity

Payload SHALL integrate with Baobab-approved identity architecture.

Payload-local authentication SHALL NOT evolve into an independent enterprise identity authority.

Where local user records are technically necessary, they SHALL represent or map to governed platform identities.

Authentication architecture SHALL support future federation and external identity providers without requiring content ownership redesign.

---

# 25. Audit

Material administrative and content lifecycle operations SHALL be auditable.

Audit information SHOULD identify:

- actor;
- action;
- canonical resource;
- tenant;
- legal entity where applicable;
- digital estate;
- market where applicable;
- timestamp;
- correlation ID;
- source;
- previous state where appropriate;
- resulting state where appropriate.

Application logs SHALL NOT be treated as a substitute for business audit records.

---

# 26. Database Ownership

The Payload Content Engine SHALL own its operational database.

No other Baobab engine SHALL share Payload's tables.

Likewise, Payload SHALL NOT directly access the operational tables of:

- MedusaJS;
- iDempiere;
- the Control Plane; or
- other engines.

This produces:

```text
Control Plane ─────► Control Plane DB

Trade Engine ──────► Trade DB

ERP Engine ────────► ERP DB

Content Engine ────► Content DB
```

Integration occurs above the persistence boundary.

---

# 27. Database Technology

Payload's supported persistence technology SHALL be selected according to Payload's production requirements and Baobab operational standards.

Baobab SHALL prefer PostgreSQL where technically appropriate and supported.

However:

> Database uniformity is subordinate to engine correctness and isolation.

Baobab SHALL NOT modify Payload internals merely to force persistence uniformity.

---

# 28. Deployment Independence

The Content Engine SHALL be independently:

- versioned;
- built;
- tested;
- deployed;
- scaled;
- rolled back;
- monitored; and
- upgraded.

A Payload deployment SHALL NOT require redeploying MedusaJS, iDempiere or a digital estate unless an explicit contract compatibility change requires coordinated release.

---

# 29. Regional Deployment

The architecture SHALL permit future regional engine instances.

For example:

```text
Payload
│
├── Africa South
├── Africa East
└── future regions
```

The architecture SHALL NOT assume that all content for all organisations must permanently reside in one global Payload database.

`EngineInstance`, `MappingScope`, `Context` and `IsolationProfile` SHALL permit regional placement without changing canonical content identity.

---

# 30. Data Residency

Content placement SHALL be capable of respecting jurisdictional and organisational data-residency requirements.

Residency SHALL be a deployment and governance concern rather than an assumption embedded into content schemas.

Where regulation or contractual obligations require dedicated regional storage or processing, the engine architecture SHALL permit it.

---

# 31. Extensibility

Payload extensions SHALL be classified.

At minimum:

```text
Upstream Payload
      │
      ├── Configuration
      ├── Baobab Collections
      ├── Baobab Globals
      ├── Baobab Hooks
      ├── Baobab Access Policies
      ├── Baobab Plugins
      └── Baobab Integration Adapters
```

Deep upstream modifications SHOULD be avoided.

Forking Payload itself SHALL require a separate ADR demonstrating why supported extension mechanisms are insufficient.

---

# 32. Upgradeability

The Baobab Content Engine SHALL preserve an upgrade path to future Payload releases.

Customisations SHALL therefore favour public extension points.

CI SHALL test compatibility between:

```text
Baobab extensions
       ↕
selected Payload version
```

Dependency upgrades SHALL NOT be treated as routine package bumps where they alter engine contracts or persistence semantics.

---

# 33. Repository Boundary

`baobab-platform/baobab-cms` SHALL own:

- Payload configuration;
- Baobab content models;
- Payload-specific access policies;
- engine-specific integrations;
- engine-specific event adapters;
- CMS runtime;
- CMS tests;
- CMS deployment artefacts;
- engine documentation.

It SHALL NOT own canonical organisation-wide definitions that properly belong in `baobab-platform/shared`.

---

# 34. Shared Contract Boundary

`baobab-platform/shared` remains authoritative for portable organisation-wide contracts.

Where appropriate, it SHALL define:

- canonical JSON Schemas;
- OpenAPI conventions;
- AsyncAPI contracts;
- event envelopes;
- canonical identifiers;
- shared vocabulary;
- compatibility policies;
- contract-test fixtures.

Payload SHALL consume those contracts.

Payload SHALL NOT silently redefine them.

---

# 35. Control Plane Integration

The Content Engine SHALL register as an `Engine`.

Deployments SHALL be representable as `EngineInstance` records.

Capabilities may include, for example:

```text
content.management
content.delivery
content.localisation
content.media
content.seo
content.navigation
content.editorial-product
```

Tenant or digital-estate access SHALL be governed through `CapabilityBinding`.

This allows Baobab to determine:

```text
who
can consume
which content capability
from which engine instance
under which context
with which isolation profile
```

without placing editorial content itself in the Control Plane.

---

# 36. Failure Isolation

Failure of the Content Engine SHALL NOT corrupt the operational state of other engines.

For example, Payload unavailability SHALL NOT invalidate:

- an existing ERP posting;
- an existing commerce order;
- canonical tenant state;
- legal-entity identity;
- historical events.

Digital estates MAY experience degraded editorial functionality when Payload is unavailable.

Critical customer journeys SHOULD define appropriate caching or degradation strategies separately.

---

# 37. Caching

Content delivery MAY employ caching at appropriate layers.

Caching SHALL NOT become canonical persistence.

Caches SHALL be safely rebuildable.

Cache keys SHALL include sufficient context to prevent leakage between:

- tenants;
- digital estates;
- markets;
- locales; and
- access scopes.

Cross-tenant cache contamination SHALL be treated as a security defect.

---

# 38. Search

Payload SHALL NOT force Baobab to introduce a platform-wide search engine prematurely.

Initial content search SHOULD use the simplest production-suitable capability available.

External search infrastructure such as OpenSearch SHALL be introduced only where justified by measurable requirements.

Search indexes SHALL be treated as derived state and SHALL remain rebuildable.

---

# 39. Security

The Content Engine SHALL comply with Baobab security standards including:

- least privilege;
- secure defaults;
- secret externalisation;
- dependency scanning;
- container scanning;
- protected branches;
- CODEOWNERS;
- SHA-pinned GitHub Actions;
- reproducible builds;
- vulnerability management;
- auditability;
- secure transport;
- security headers;
- access-control testing; and
- supply-chain controls.

Secrets SHALL NOT be committed to source control.

---

# 40. Observability

The Content Engine SHALL expose sufficient telemetry for production operation.

Telemetry SHOULD include:

- structured logs;
- metrics;
- traces where supported;
- health;
- readiness;
- dependency health;
- request correlation;
- event publication status;
- queue/outbox status;
- integration failures.

Canonical correlation identifiers SHALL propagate across engine boundaries where applicable.

---

# 41. Development Environment

The repository SHALL consume an appropriate versioned `baobab-platform/baobab-dev` development profile.

The development environment SHALL remain reproducible through GitHub Codespaces and Docker DevContainers.

The development image SHALL provide tooling.

The Payload runtime SHALL remain a separately testable application/runtime boundary.

---

# 42. CI/CD

The repository SHALL implement production-grade CI/CD consistent with Nabhold organisational standards.

Required controls include:

- deterministic dependency installation;
- linting;
- type checking;
- unit testing;
- integration testing;
- contract testing;
- build verification;
- security scanning;
- dependency scanning;
- container scanning;
- migration verification;
- reproducible builds;
- SHA-pinned GitHub Actions;
- protected release processes.

---

# 43. Contract Compatibility

CI SHALL verify that `baobab-cms` remains compatible with the versions of Baobab contracts it declares.

Breaking contract changes SHALL NOT be silently deployed.

Compatibility rules SHALL support controlled evolution of:

- APIs;
- events;
- canonical schemas;
- identifiers;
- mapping contracts.

---

# 44. Content Migration

Content models SHALL be treated as versioned production data contracts.

Schema evolution SHALL therefore require controlled migrations.

Production content SHALL NOT depend on developers manually editing database records.

Migrations SHALL be:

- reviewable;
- repeatable;
- testable;
- observable;
- recoverable where feasible.

---

# 45. Backup and Recovery

The Content Engine SHALL have independently testable backup and recovery procedures covering:

- database state;
- media/object references;
- required configuration;
- encryption dependencies;
- integration metadata.

Backup existence alone SHALL NOT satisfy recovery requirements.

Restoration procedures SHALL be periodically testable.

---

# 46. Reconciliation

Because Payload participates in distributed integrations, reconciliation SHALL be a first-class capability.

The platform SHALL eventually be capable of answering questions such as:

```text
Which canonical products have no Payload content?

Which Payload product-content records have no valid canonical mapping?

Which published records reference disabled markets?

Which events failed publication?

Which external mappings are stale?

Which media references are unavailable?
```

Distributed consistency SHALL therefore rely on explicit reconciliation rather than assumptions of perfect synchronous delivery.

---

# 47. No Hard-Coded Organisations

Code SHALL NOT contain organisation-specific branches such as:

```text
if tenant == "thamani":
    ...
elif tenant == "zuribeans":
    ...
```

Organisation, market, digital-estate and capability behaviour SHALL be configuration- or policy-driven.

Onboarding another organisation SHALL not require modifying core Payload application logic merely to recognise its name.

---

# 48. No Hard-Coded Markets

Likewise, business logic SHALL NOT assume a permanent set of countries, currencies or markets.

The architecture SHALL permit organisations to expand independently.

For example:

```text
Zuribeans
    South Africa
    Uganda
    Kenya
    future markets

Thamani
    South Africa
    Uganda
    future markets
```

without requiring a redesign of the Content Engine.

---

# 49. No Cross-Engine Transactions

Baobab SHALL NOT attempt distributed ACID transactions spanning Payload, MedusaJS, iDempiere and the Control Plane.

Cross-engine consistency SHALL instead use:

- canonical mappings;
- events;
- idempotency;
- retries;
- sagas/workflows where required;
- reconciliation.

Each engine SHALL retain transaction authority over its own persistence boundary.

---

# 50. Rejected Alternatives

## 50.1 Build a Custom CMS

Rejected.

Baobab does not gain strategic advantage from implementing basic CMS capabilities from scratch.

Doing so would increase:

- engineering cost;
- maintenance burden;
- security responsibility;
- editorial tooling requirements;
- media-management complexity;
- upgrade burden.

Baobab's value lies in orchestration, governance, integration and domain-specific capabilities rather than reinventing commodity content-management infrastructure.

---

## 50.2 Use MedusaJS as the CMS

Rejected.

Commerce and editorial content have different authority boundaries.

Using Medusa as the primary enterprise CMS would unnecessarily couple editorial capability to the Trade Engine.

---

## 50.3 Use iDempiere as the CMS

Rejected.

ERP records and editorial content represent fundamentally different domains.

iDempiere SHALL remain focused on ERP authority.

---

## 50.4 Store Content in Digital Estate Repositories

Rejected as the primary content-management strategy.

Source-controlled static content may remain appropriate for limited technical or immutable content, but business editorial content requires independent lifecycle management.

Embedding enterprise content in frontend repositories would couple publication to software deployment.

---

## 50.5 Build CMS Functionality into the Control Plane

Rejected.

The Control Plane governs platform metadata and lifecycle.

It SHALL NOT become a business-content repository.

---

## 50.6 Shared Database Across Engines

Rejected.

Shared persistence would create:

- hidden coupling;
- incompatible upgrade dependencies;
- security risk;
- ownership ambiguity;
- difficult migrations;
- replacement barriers.

---

## 50.7 One Payload Instance Per Legal Entity as a Permanent Rule

Rejected.

Dedicated instances may be valid under particular isolation profiles, but SHALL NOT become the universal tenancy model.

Deployment topology is an isolation decision, not organisational ontology.

---

# 51. Consequences

## 51.1 Positive Consequences

Baobab gains:

- a mature headless CMS foundation;
- separation between content and commerce;
- separation between content and ERP;
- independent content lifecycle;
- frontend independence;
- structured content;
- localisation;
- media management;
- API-first delivery;
- editorial administration;
- replaceability through canonical mappings;
- independent scaling;
- regional deployment options;
- reduced custom engineering burden.

---

## 51.2 Negative Consequences

The decision introduces:

- another production engine;
- another persistence boundary;
- mapping requirements;
- distributed consistency;
- additional operational monitoring;
- additional security surface;
- contract-versioning requirements;
- reconciliation requirements;
- potential editorial/commercial synchronisation complexity.

These costs are accepted because they preserve domain integrity and long-term replaceability.

---

# 52. Architectural Invariants

The following are normative.

1. Payload CMS is the foundation of the Baobab Content Engine.
2. `baobab-platform/baobab-cms` is independently deployable.
3. Payload owns editorial content, not commerce transactions.
4. Medusa owns commerce state.
5. iDempiere owns ERP state.
6. The Control Plane owns canonical platform lifecycle metadata.
7. `baobab-platform/shared` owns portable organisation-wide contracts.
8. Engines do not share operational databases.
9. Cross-engine SQL access is prohibited.
10. Payload internal IDs are not canonical Baobab IDs.
11. Slugs are not canonical IDs.
12. Canonical mappings are explicit.
13. Tenant and legal entity remain distinct concepts.
14. Isolation is policy-driven.
15. Market and country are not synonymous.
16. Digital estates remain independently deployable.
17. Frontend technology is not dictated by Payload.
18. Content localisation is explicit.
19. Cross-engine integrations use APIs and/or events.
20. Distributed consumers are idempotent.
21. Significant integration failures are reconcilable.
22. Persistent media does not depend on ephemeral container filesystems.
23. Organisation-specific core-code branches are prohibited.
24. Market-specific core-code branches are prohibited.
25. Payload upstream modifications require explicit architectural justification.
26. Content schema changes are governed production migrations.
27. Content Engine deployment may evolve regionally without changing canonical identity.

---

# 53. Conformance Tests

An implementation conforms to this ADR only if automated or reviewable evidence demonstrates the following.

### CT-01 — Independent Deployment

`baobab-cms` can be built and deployed without rebuilding MedusaJS, iDempiere or a digital estate.

### CT-02 — Persistence Isolation

No Content Engine code directly queries another engine's operational database.

### CT-03 — Canonical Identity

Public integration contracts do not depend exclusively on Payload internal IDs.

### CT-04 — Tenant Isolation

A content request for tenant A cannot retrieve tenant B content without explicitly authorised cross-tenant capability.

### CT-05 — Digital Estate Isolation

Content scoped exclusively to one digital estate cannot leak into another through ordinary delivery APIs.

### CT-06 — Market Isolation

Market-specific content is returned only under valid market context and inheritance rules.

### CT-07 — Localisation

Locale resolution follows deterministic configured fallback rules.

### CT-08 — Product Authority

Editing editorial product content in Payload cannot directly mutate Medusa transactional pricing.

### CT-09 — ERP Authority

Editing Payload content cannot directly create or modify iDempiere financial postings.

### CT-10 — Event Idempotency

Reprocessing the same canonical event does not create duplicate externally visible state.

### CT-11 — Mapping Integrity

Invalid canonical mappings are detectable through reconciliation.

### CT-12 — Media Durability

Restarting or replacing the application container does not destroy persistent production media.

### CT-13 — Contract Compatibility

CI rejects incompatible changes to declared Baobab contracts.

### CT-14 — Organisation Neutrality

Onboarding a new legal entity does not require adding organisation-name conditionals to core engine code.

### CT-15 — Market Neutrality

Adding a new market does not require hard-coded country branches in core engine code.

---

# 54. Implementation Implications

This ADR does not prescribe the complete physical Payload implementation.

It establishes the parent architectural contract from which more specific ADRs SHALL derive.

At minimum, child decisions are required for:

1. Payload multi-tenancy and isolation architecture;
2. canonical content identity and mapping;
3. content authority and Medusa product-content composition;
4. market, locale and inheritance rules;
5. digital-estate content scoping;
6. media and object-storage architecture;
7. Payload identity, authentication and authorisation;
8. canonical event publishing and transactional outbox;
9. Payload deployment, scaling and regionalisation;
10. content schema governance and migrations;
11. caching and delivery architecture;
12. backup, recovery and reconciliation.

Child ADRs SHALL NOT contradict this parent ADR without explicitly superseding it.

---

# 55. Decision Outcome

Payload CMS is adopted as the foundation of the Baobab Content Engine.

The decision deliberately avoids turning Payload into the Baobab Platform itself.

The architectural relationship is:

```text
                     BAOBAB CONTROL PLANE
                              │
                     canonical context
                              │
        ┌─────────────────────┼─────────────────────┐
        │                     │                     │
        ▼                     ▼                     ▼
  CONTENT ENGINE         TRADE ENGINE          ERP ENGINE
    Payload CMS            MedusaJS              iDempiere
        │                     │                     │
        └──────────────┬──────┴──────────────┬──────┘
                       │                     │
                 canonical mappings     canonical events
                       │                     │
                       └──────────┬──────────┘
                                  │
                                  ▼
                           DIGITAL ESTATES
```

The Content Engine owns editorial truth.

The Trade Engine owns commerce truth.

The ERP Engine owns ERP truth.

The Control Plane owns platform governance and canonical operating context.

`baobab-platform/shared` owns portable organisational contracts.

Digital estates compose those capabilities into experiences appropriate to their legal entities, brands, markets and customers.

This separation is the governing architectural foundation for all subsequent Payload CMS implementation decisions.