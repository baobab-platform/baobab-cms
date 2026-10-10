# ADR-0012: Payload CMS Multi-Tenancy and Content Isolation Architecture

**Status:** Accepted  
**Date:** 2026-09-02  
**Decision Class:** Platform Architecture / Content Management / Multi-Tenancy  
**Scope:** Baobab Content Engine  
**Repository:** `baobab-platform/baobab-cms`  
**Parent ADR:** `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`  
**Supersedes:** None  
**Related:** Baobab Canonical Mapping Model, Baobab Control Plane Physical Data Model, Baobab Tenancy Architecture  
**Architectural Style:** Context-resolved, policy-driven, isolation-profile-based multi-tenancy

---

# 1. Context

ADR-0011 establishes Payload CMS as the foundation of the Baobab Content Engine.

Payload is required to serve multiple independently governed organisations, legal entities, digital estates, markets, locales and potentially regions without collapsing these concepts into a single simplistic tenant identifier.

Baobab's established tenancy principle is:

> A legal entity is the default tenant boundary, but a legal entity is not synonymous with tenancy.

The Content Engine must therefore support tenancy without encoding assumptions such as:

```text
Tenant = Legal Entity
```

or:

```text
Tenant = Domain
```

or:

```text
Tenant = Payload Instance
```

or:

```text
Tenant = Database
```

These may coincide in a particular deployment, but none is universally equivalent to tenancy.

The Control Plane already defines the concepts necessary to model this correctly, including:

- `CanonicalEntity`;
- `ExternalReference`;
- `Mapping`;
- `MappingScope`;
- `Market`;
- `DigitalEstate`;
- `Engine`;
- `EngineInstance`;
- `Capability`;
- `CapabilityBinding`;
- `Context`; and
- `IsolationProfile`.

The Content Engine must consume these concepts rather than inventing an independent tenancy ontology.

---

# 2. Problem Statement

A naïve Payload implementation might isolate content by adding a field such as:

```text
tenant_id
```

to every collection and filtering records accordingly.

That is insufficient for Baobab.

Baobab must account for situations such as:

```text
one tenant
    ├── multiple legal entities
    ├── multiple brands
    ├── multiple digital estates
    ├── multiple markets
    └── multiple locales
```

as well as:

```text
one legal entity
    ├── default tenant boundary today
    └── potentially multiple isolation contexts later
```

and potentially:

```text
one Payload deployment
    ├── tenant A
    ├── tenant B
    └── tenant C
```

or:

```text
tenant A
    └── dedicated Payload deployment
```

or:

```text
tenant A
    ├── Africa South Payload instance
    └── Africa East Payload instance
```

The architecture must support all such forms without rewriting content models.

The system must also ensure that errors in:

- API filtering;
- hooks;
- administrative UI behaviour;
- background jobs;
- caching;
- media handling;
- search;
- event processing; or
- integration code

cannot casually result in cross-tenant data exposure.

---

# 3. Decision

The Baobab Content Engine SHALL implement **context-resolved, policy-driven multi-tenancy**.

Tenancy SHALL be determined by canonical Baobab `Context` and enforced according to the applicable `IsolationProfile`.

Payload SHALL NOT independently determine canonical tenant identity.

The normative request flow SHALL be:

```text
Request
   │
   ▼
Identity Resolution
   │
   ▼
Canonical Context Resolution
   │
   ├── Tenant
   ├── Legal Entity
   ├── Digital Estate
   ├── Market
   ├── Locale
   ├── Actor
   └── Capability
   │
   ▼
Isolation Profile Resolution
   │
   ▼
Authorisation
   │
   ▼
Payload Access Policy
   │
   ▼
Content Operation
```

Payload SHALL consume resolved context through a defined Baobab integration boundary.

It SHALL NOT derive canonical tenancy merely from local content records.

---

# 4. Tenancy Vocabulary

The following concepts SHALL remain distinct.

## 4.1 Tenant

A `Tenant` represents an isolation and consumption boundary within the Baobab Platform.

A tenant may commonly correspond to a legal entity, but this is not guaranteed.

---

## 4.2 Legal Entity

A `LegalEntity` represents an incorporated, registered or otherwise legally recognised organisational entity.

A legal entity may be the default tenant boundary.

It SHALL NOT be treated as the definition of tenancy itself.

---

## 4.3 Digital Estate

A `DigitalEstate` represents an independently governed digital experience or presence.

Examples include:

```text
corporate website
B2B portal
B2C storefront
partner portal
mobile experience
regional brand site
campaign estate
```

A digital estate exists within tenancy and organisational context but does not itself automatically define the tenant.

---

## 4.4 Market

A `Market` represents an operating or commercial context.

It may involve:

- geography;
- currency;
- language;
- regulatory regime;
- customer segment;
- channel;
- brand;
- legal entity; or
- combinations thereof.

A market SHALL NOT be treated as a tenant.

---

## 4.5 Locale

A locale represents language and regional presentation context.

A locale SHALL NOT grant tenancy rights.

---

## 4.6 Context

A Baobab `Context` is the canonical execution context under which an operation occurs.

A content operation SHALL derive its effective authority from context rather than a single isolated field.

Conceptually:

```text
Context
│
├── Tenant
├── Legal Entity
├── Digital Estate
├── Market
├── Locale
├── Actor
├── Capability
└── Isolation Profile
```

---

# 5. Canonical Tenant Authority

The Baobab Control Plane SHALL remain authoritative for tenant identity and lifecycle.

Payload MAY hold references to canonical tenant IDs for filtering and local enforcement.

Payload SHALL NOT independently:

- create canonical tenants;
- retire canonical tenants;
- merge canonical tenants;
- redefine canonical tenant hierarchy;
- change tenant isolation profiles;
- assign tenant capabilities.

Those operations remain Control Plane responsibilities.

---

# 6. Tenant Projection

Payload MAY maintain a local projection of Control Plane tenant metadata where operationally useful.

For example:

```text
PayloadTenantProjection
-----------------------
canonical_tenant_id
display_name
status
isolation_profile_reference
synchronisation_version
last_synchronised_at
```

Such projections are caches or engine-local representations.

They SHALL NOT become authoritative tenant records.

If the projection and Control Plane disagree, the Control Plane remains authoritative unless an explicit degraded-operation policy states otherwise.

---

# 7. Canonical Tenant Identifier

Every tenant-scoped record SHALL carry or be resolvably associated with a canonical tenant identifier.

The canonical identifier SHALL:

- be immutable;
- be globally unique within Baobab;
- originate from the canonical platform model;
- not depend on tenant name;
- not depend on hostname;
- not depend on Payload record ID;
- not depend on organisation slug.

A tenant name may change without changing tenant identity.

---

# 8. Context Dimensions

Content isolation SHALL be multidimensional.

At minimum, the architecture SHALL recognise:

```text
tenant
legal entity
digital estate
market
locale
```

Not every record requires every dimension.

For example:

```text
corporate disclaimer
    tenant
    digital estate
    locale
```

while:

```text
market campaign
    tenant
    legal entity
    digital estate
    market
    locale
```

and:

```text
shared tenant brand asset
    tenant
```

may all be valid.

The applicable scope SHALL be determined by content type and policy.

---

# 9. Mandatory Tenant Ownership

Every tenant-owned business content record SHALL be associated with exactly one canonical tenant unless explicitly classified as platform-global content.

This gives the base invariant:

```text
Tenant-owned content
        │
        └── exactly one tenant owner
```

A record SHALL NOT belong directly to multiple tenants.

Where the same semantic content is shared between tenants, it SHALL be represented through one of:

- platform-global content;
- governed references;
- explicit replication;
- canonical shared resource relationships.

Implicit multi-owner records are prohibited.

---

# 10. Platform-Global Content

Some content MAY be platform-global.

Examples might include:

- generic platform documentation;
- shared Baobab legal material;
- platform-wide technical metadata;
- common reference material.

Platform-global status SHALL be explicit.

The system SHALL NOT infer:

```text
tenant_id == null
```

to mean "visible to everyone."

A null tenant association SHALL instead be treated as invalid unless the record type explicitly supports global scope.

This avoids one of the most dangerous multi-tenant failure patterns:

```text
missing tenant filter
     ↓
null tenant
     ↓
accidental global visibility
```

---

# 11. Tenant Scope Model

Every tenant-aware content type SHALL define an explicit scope model.

A conceptual representation is:

```text
ContentScope
│
├── PLATFORM
├── TENANT
├── LEGAL_ENTITY
├── DIGITAL_ESTATE
├── MARKET
└── LOCALE
```

This SHALL represent scope semantics, not merely UI grouping.

Scope determines:

- eligibility;
- visibility;
- inheritance;
- authorisation;
- publication;
- caching;
- event metadata;
- reconciliation.

---

# 12. Isolation Profiles

The physical enforcement strategy SHALL be driven by `IsolationProfile`.

At minimum, Baobab SHALL support architectural representation of the following classes.

## 12.1 Shared Application / Shared Database

```text
Payload Instance
       │
       ▼
Shared Database
       │
 ┌─────┼─────┐
 ▼     ▼     ▼
T-A   T-B   T-C
```

Isolation is enforced logically.

---

## 12.2 Shared Application / Dedicated Database

```text
Payload Runtime
      │
 ┌────┼────┐
 ▼    ▼    ▼
DB-A DB-B DB-C
```

Where technically appropriate.

---

## 12.3 Dedicated Engine Instance

```text
Tenant A
   │
   ▼
Payload A
   │
   ▼
Database A
```

and:

```text
Tenant B
   │
   ▼
Payload B
   │
   ▼
Database B
```

---

## 12.4 Regional Dedicated Instance

```text
Tenant A
   │
   ├── Africa South
   │      └── Payload Instance SA
   │
   └── Africa East
          └── Payload Instance EA
```

---

# 13. Isolation Profile Principle

Content schemas SHALL NOT be redesigned merely because a tenant moves from one isolation profile to another.

For example, movement from:

```text
shared database
```

to:

```text
dedicated engine instance
```

SHOULD remain primarily an operational migration rather than a domain-model rewrite.

This is why canonical IDs must remain independent of physical topology.

---

# 14. Default Isolation Strategy

The default initial Baobab Content Engine deployment SHALL use:

> **shared Payload application infrastructure with explicit logical tenant isolation**, subject to capacity, regulatory and contractual requirements.

This decision minimises unnecessary infrastructure duplication during early platform growth.

It SHALL NOT prevent future dedicated isolation.

A tenant SHALL be eligible for stronger isolation when justified by:

- regulation;
- residency;
- contractual requirement;
- security classification;
- operational scale;
- performance;
- customer commitment;
- risk classification.

---

# 15. Defence in Depth

Tenant isolation SHALL NOT depend on one filter.

The implementation SHALL provide multiple enforcement layers.

At minimum:

```text
Canonical Context
        ↓
Authorisation
        ↓
Payload Access Control
        ↓
Query Scoping
        ↓
Hook Validation
        ↓
Cache Scoping
        ↓
Media Scoping
        ↓
Event Scoping
```

A failure in one layer SHOULD be constrained by another.

---

# 16. Payload Access Control

Every tenant-aware collection SHALL implement tenant-scoped access policies.

Access rules SHALL apply to:

- read;
- create;
- update;
- delete;
- publish;
- administrative operations.

A user authenticated to tenant A SHALL NOT be able to request tenant B data merely by supplying tenant B's identifier.

Canonical context and membership must authorise the operation.

---

# 17. Create Operations

On tenant-owned record creation, the tenant SHALL be derived from trusted execution context.

Client-supplied tenant IDs SHALL NOT be blindly trusted.

The preferred pattern is:

```text
Authenticated Context
        │
        ▼
Resolved Tenant
        │
        ▼
Server assigns tenant identity
```

rather than:

```text
Client sends arbitrary tenant_id
        │
        ▼
Payload persists it
```

If a tenant identifier is accepted from an administrative interface, it SHALL still be validated against the actor's authorised contexts.

---

# 18. Read Operations

Tenant-aware queries SHALL be automatically constrained by effective canonical context.

The caller SHALL NOT be expected to remember to apply the tenant filter.

The unsafe pattern:

```text
payload.find({
    collection: "pages"
})
```

without tenant scope in a tenant-bound execution path SHALL be prohibited unless explicitly running under platform administrative authority.

Tenant filtering SHALL be enforced centrally wherever technically possible.

---

# 19. Update Operations

Before modifying a record, the Content Engine SHALL verify that:

```text
record tenant
      ==
authorised context tenant
```

or that the actor possesses a specifically governed cross-tenant capability.

Changing a record's tenant ownership SHALL NOT be treated as an ordinary edit.

It SHALL require a controlled transfer operation or migration workflow.

---

# 20. Delete Operations

Delete permissions SHALL remain tenant-scoped.

A user with delete permission inside tenant A SHALL NOT have equivalent permission in tenant B.

High-impact deletion MAY require additional governance through:

- approval;
- archival-first policies;
- soft deletion;
- retention controls;
- audit.

---

# 21. Administrative Users

Payload administrative access SHALL NOT imply unrestricted cross-tenant authority.

Editorial administrators SHOULD be scoped to authorised tenant contexts.

Platform-level administrators MAY have cross-tenant authority only through explicit privileged roles or capabilities.

The architecture SHALL distinguish:

```text
Tenant Administrator
```

from:

```text
Platform Administrator
```

These roles SHALL NOT be interchangeable.

---

# 22. Superuser Governance

Any Payload-level superuser or equivalent unrestricted administrative account SHALL be considered a privileged platform identity.

Such accounts SHALL:

- be minimised;
- not be used for normal editorial work;
- be strongly authenticated;
- be auditable;
- be subject to secret/access governance;
- be excluded from ordinary tenant workflows.

"Superuser" SHALL NOT become the convenient workaround for poorly designed tenant permissions.

---

# 23. Legal Entity Scoping

Within a tenant, content MAY additionally be scoped to legal entities.

For example:

```text
Tenant: Nabhold Group
│
├── Legal Entity A
├── Legal Entity B
└── Legal Entity C
```

where such tenancy structure is intentionally configured.

Legal-entity scope SHALL further restrict content visibility.

It SHALL NOT broaden tenant visibility.

Therefore:

```text
tenant boundary
    ↓
legal entity boundary
```

is a narrowing operation.

---

# 24. Digital Estate Scoping

A tenant may operate multiple digital estates.

Content MAY be:

- estate-specific;
- shared across selected estates;
- tenant-wide.

The Content Engine SHALL distinguish these cases explicitly.

A page intended for one estate SHALL NOT appear in another merely because both belong to the same tenant.

---

# 25. Digital Estate Relationships

Content SHALL normally reference canonical `DigitalEstate` identities rather than relying on hostname values.

This permits:

```text
Digital Estate
    │
    ├── production.example.com
    ├── staging.example.com
    └── future domain
```

without changing canonical content ownership.

Domains are routing/configuration data.

They are not canonical digital-estate identity.

---

# 26. Market Scoping

Market-specific content SHALL be constrained by canonical Market identity.

Market filtering SHALL occur in addition to tenant enforcement.

A caller SHALL never gain access to another tenant's records simply because both operate in the same market.

Therefore:

```text
Market = South Africa
```

does not mean:

```text
all South African content
```

It means:

```text
content within authorised tenant/context
that is applicable to Market South Africa
```

---

# 27. Locale Scoping

Locale SHALL be resolved only after valid tenancy and content scope have been established.

Locale fallback SHALL NOT cross tenant boundaries.

For example:

```text
Tenant A
en-ZA missing
```

must never fall back to:

```text
Tenant B
en-ZA
```

The rule appears obvious. Multi-tenant bugs have an unfortunate habit of making obvious rules suddenly valuable.

---

# 28. Scope Inheritance

Scope inheritance SHALL be explicit.

A content item MAY inherit applicability from a broader context only according to a defined policy.

Conceptually:

```text
Platform
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

This does NOT mean every child automatically inherits every parent record.

Content type policy determines whether inheritance is:

- allowed;
- prohibited;
- overriding;
- additive;
- replace-only.

The detailed inheritance algorithm SHALL be defined in a dedicated child ADR.

---

# 29. Scope Precedence

Where multiple eligible content records exist, resolution SHALL use deterministic precedence.

The engine SHALL NOT rely on database retrieval order.

An eventual resolver may apply a pattern such as:

```text
most specific valid scope
        ↓
less specific authorised scope
        ↓
configured fallback
```

The exact precedence rules are deferred.

However, deterministic resolution is mandatory.

---

# 30. API Context

External and internal API requests SHALL carry sufficient information to resolve Baobab context.

Context MAY be established through combinations of:

- authenticated identity;
- trusted token claims;
- canonical tenant ID;
- digital-estate identity;
- market identity;
- locale;
- domain resolution;
- capability binding.

No single client-provided header SHALL constitute authoritative tenancy by itself.

---

# 31. Trusted Context Boundary

Only Baobab-approved components SHALL be allowed to assert trusted canonical context.

For example:

```text
untrusted browser
       │
       ▼
Digital Estate Backend / Gateway
       │
       ▼
Trusted context assertion
       │
       ▼
Content Engine
```

or approved direct API patterns with equivalent authentication and validation.

Tenant context SHALL be cryptographically and logically bound to authenticated authority where appropriate.

---

# 32. Domain Resolution

A request domain MAY assist in resolving a digital estate and therefore context.

However:

```text
Host header
```

alone SHALL NOT be treated as canonical tenant authority.

Domain resolution SHALL be backed by Control Plane configuration or an authoritative projection.

Unknown or ambiguous domains SHALL fail closed.

---

# 33. Background Jobs

Background jobs SHALL execute under explicit canonical context.

The following pattern is prohibited:

```text
background job
     ↓
query all content
     ↓
hope filtering is correct
```

Jobs SHALL carry sufficient metadata to determine:

- tenant;
- scope;
- actor/system principal;
- correlation;
- operation.

Platform-wide jobs SHALL explicitly declare platform scope.

---

# 34. Scheduled Publishing

Scheduled publication operations SHALL preserve the content's tenant and scope.

A scheduling subsystem SHALL NOT process scheduled records outside their authorised isolation context.

Scheduled jobs SHALL emit appropriately scoped audit and event metadata.

---

# 35. Hooks

Payload hooks handling tenant-owned data SHALL receive or resolve trusted canonical context.

Hooks SHALL NOT infer tenant identity from mutable attributes such as:

- title;
- slug;
- collection;
- hostname;
- email domain.

Hooks that create related records SHALL propagate tenant and scope explicitly.

---

# 36. Relationships

Cross-tenant content relationships SHALL be prohibited by default.

For example:

```text
Tenant A Page
     ─────X─────>
Tenant B Media
```

SHALL fail unless the related resource is explicitly classified as globally shareable or the relationship is governed by a formal cross-tenant sharing mechanism.

Relationship validation SHALL therefore include tenant compatibility checks.

---

# 37. Media Isolation

Media SHALL participate in the same tenancy model.

A media asset SHALL carry or inherit sufficient scope to determine its owner and eligibility.

Object-store keys SHOULD include non-sensitive isolation information sufficient to prevent accidental collisions.

However, storage path naming SHALL NOT be the sole security boundary.

Access control SHALL remain authoritative.

---

# 38. Signed Media Access

Private media SHOULD be delivered through controlled mechanisms such as:

- authenticated delivery;
- signed URLs;
- restricted CDN access;
- equivalent policy-enforced mechanisms.

Possession of an object path SHALL NOT automatically imply authorisation.

---

# 39. Object Storage Boundaries

Where shared object storage is used, tenant resources SHALL be partitioned logically.

Conceptually:

```text
bucket
│
├── tenant-a/
├── tenant-b/
└── tenant-c/
```

or equivalent opaque partitioning.

Dedicated buckets MAY be selected by stronger `IsolationProfile`.

The physical layout SHALL remain replaceable without changing canonical media identity.

---

# 40. Search Isolation

Search queries SHALL always apply tenant and authorised scope before presenting results.

If external indexing infrastructure is later introduced, every indexed tenant-owned document SHALL carry sufficient isolation metadata.

A shared search index SHALL NOT be allowed to return cross-tenant documents merely because an application-layer filter was omitted.

---

# 41. Cache Isolation

Cache keys SHALL contain sufficient context.

At minimum, tenant-sensitive caches SHOULD include:

```text
tenant
digital estate
market
locale
resource identity
```

as applicable.

Unsafe:

```text
page:home
```

Safer:

```text
tenant:{tenant}:estate:{estate}:market:{market}:locale:{locale}:page:{id}
```

The exact representation may differ.

The invariant is that cached output for one isolation context cannot satisfy an unrelated context.

---

# 42. CDN Isolation

CDN caching rules SHALL preserve content isolation.

Public tenant content may be widely cacheable where appropriate.

Private or restricted content SHALL NOT be inadvertently promoted to public cache scope.

Cache invalidation events SHALL include adequate scope metadata.

---

# 43. Preview Content

Draft and preview content SHALL remain tenant-isolated.

Preview URLs or tokens SHALL:

- be scoped;
- expire where appropriate;
- not provide unrestricted CMS access;
- not grant access to unrelated tenant drafts.

Draft visibility is a privileged capability.

---

# 44. Draft and Published State

Publishing status SHALL NOT alter tenant ownership.

A draft record and its published representation SHALL retain the same canonical ownership and isolation scope unless a deliberate governed transfer occurs.

---

# 45. Version History

Content version history SHALL remain protected by the same tenant boundary as the active record.

A user authorised to read the current version does not necessarily gain rights to all historical versions unless policy permits.

Historical state SHALL never become a cross-tenant bypass.

---

# 46. Event Scoping

Every externally published canonical event concerning tenant-owned content SHALL include canonical tenancy metadata.

A representative event envelope includes:

```text
event_id
event_type
occurred_at
tenant_id
legal_entity_id?
digital_estate_id?
market_id?
locale?
canonical_entity_id
correlation_id
causation_id
source_engine
source_instance
schema_version
```

Optional fields depend on content scope.

Payload internal identifiers MAY appear as external-reference metadata but SHALL NOT replace canonical identifiers.

---

# 47. Event Consumers

Consumers SHALL validate tenant context.

An event received for tenant A SHALL not mutate tenant B projections.

Event handlers SHALL not infer tenant from payload body content when canonical tenant metadata exists in the event envelope.

---

# 48. Webhooks

Outbound webhooks SHALL be scoped to the tenants or contexts for which the endpoint is authorised.

A tenant-configured webhook SHALL not receive another tenant's events.

Webhook destinations SHALL be governed integration resources, not arbitrary content fields.

---

# 49. Imports

Bulk imports SHALL require an explicit tenant context.

The importer SHALL NOT create records lacking valid tenant ownership.

Where an import contains tenant identifiers, they SHALL be validated rather than blindly accepted.

Cross-tenant imports SHALL require privileged platform operation.

---

# 50. Exports

Exports SHALL be tenant-scoped unless explicitly authorised as cross-tenant platform operations.

Export tooling SHALL apply the same access policies as interactive APIs.

"Data export" is not an excuse to bypass tenancy.

---

# 51. Content Cloning

Copying content between tenants SHALL be treated as an explicit operation.

A clone SHALL produce new tenant-owned records rather than retaining ambiguous shared ownership.

Canonical relationships SHALL clearly distinguish:

```text
source record
```

from:

```text
cloned record
```

where provenance matters.

---

# 52. Tenant Transfer

Changing ownership from tenant A to tenant B SHALL not be permitted as an ordinary field update.

A transfer SHALL be a governed workflow capable of validating:

- relationships;
- media;
- permissions;
- mappings;
- URLs;
- digital estates;
- market scope;
- audit history;
- events.

In many cases, clone-and-retire may be preferable to reassignment.

---

# 53. Tenant Suspension

When a tenant is suspended by the Control Plane, the Content Engine SHALL support enforcement of that state.

Suspension policy may prevent:

- administrative access;
- publication;
- content mutation;
- API delivery;
- some or all engine operations.

The exact effect depends on capability and contractual policy.

Payload SHALL NOT invent its own independent tenant lifecycle.

---

# 54. Tenant Deactivation

Deactivation SHALL NOT immediately imply destructive deletion.

Tenant data lifecycle SHALL distinguish:

```text
ACTIVE
SUSPENDED
DEACTIVATED
ARCHIVED
PURGED
```

or equivalent canonical states.

Purging SHALL require explicit retention and governance rules.

---

# 55. Tenant Offboarding

Offboarding SHALL account for:

- content export;
- media export;
- canonical mapping closure;
- webhook/integration revocation;
- credential revocation;
- event completion;
- retention requirements;
- archival;
- deletion;
- audit preservation.

Tenant deletion SHALL not be implemented as:

```text
DELETE FROM collection WHERE tenant_id = ...
```

without lifecycle governance.

---

# 56. Regulatory Isolation

Where jurisdiction or contract requires stronger isolation, the applicable `IsolationProfile` SHALL permit:

- dedicated database;
- dedicated object storage;
- dedicated engine instance;
- dedicated network boundary;
- dedicated region;
- combinations thereof.

The canonical content model SHALL survive this topology change.

---

# 57. Regional Context

Region and market SHALL remain distinct.

A tenant operating in multiple markets may have content physically hosted in one region or multiple regions.

The engine SHALL not infer:

```text
region == market
```

or:

```text
country == region == market
```

These are different architectural concerns.

---

# 58. Cross-Region Behaviour

Where multiple regional Payload instances exist, content routing SHALL use Control Plane engine-instance and capability-binding metadata.

Conceptually:

```text
Context
   │
   ▼
CapabilityBinding
   │
   ▼
EngineInstance
   │
   ▼
Regional Payload endpoint
```

Clients SHALL NOT embed permanent regional routing logic.

---

# 59. Engine Instance Isolation

A Payload `EngineInstance` SHALL expose only the contexts assigned to it through platform governance.

An instance SHALL not assume that all Baobab tenants are necessarily valid on that instance.

This permits:

```text
Instance SA
    ├── Tenant A
    └── Tenant B

Instance EA
    └── Tenant C
```

or other governed bindings.

---

# 60. Capability Binding

Content access SHALL ultimately be permitted only where the requesting context has an appropriate `CapabilityBinding`.

For example:

```text
Tenant A
    │
    ▼
content.management
    │
    ▼
Payload Instance SA
```

A valid tenant record by itself does not imply entitlement to every Content Engine capability.

---

# 61. Runtime Configuration

Tenant configuration SHALL be data-driven.

Core code SHALL NOT contain:

```text
if tenant == "nabhold":
```

or:

```text
if tenant == "zuribeans":
```

or:

```text
if tenant == "thamani":
```

to implement ordinary tenant behaviour.

Variation belongs in:

- configuration;
- capability binding;
- market configuration;
- policy;
- content;
- extension points.

---

# 62. Schema Consistency

Where tenants share the same Payload engine instance, the platform SHOULD favour common canonical collection structures over tenant-specific collection forks.

Avoid:

```text
thamani_pages
zuribeans_pages
nabhold_pages
```

Prefer:

```text
pages
    +
tenant/context scope
```

unless materially different domains justify separate content types.

Tenant-specific schema proliferation would effectively reintroduce separate applications inside one CMS.

---

# 63. Extension Isolation

Tenant-specific extensions SHALL be exceptional.

Where unavoidable, they SHALL be:

- modular;
- explicitly registered;
- feature/capability controlled;
- testable;
- upgradeable;
- isolated from unrelated tenants.

Forking core engine logic per tenant is prohibited.

---

# 64. Database Constraints

Where supported, persistence SHALL use database constraints to reinforce tenancy invariants.

Examples include:

- tenant reference non-null where tenant scope is mandatory;
- uniqueness including tenant scope;
- foreign-key integrity;
- constrained scope values.

Application-layer enforcement alone SHOULD NOT carry invariants that the database can reliably enforce.

---

# 65. Tenant-Aware Uniqueness

Fields such as slugs MAY require uniqueness within a tenant, estate or locale rather than globally.

For example:

```text
UNIQUE (
    tenant_id,
    digital_estate_id,
    locale,
    slug
)
```

conceptually.

The exact physical implementation SHALL follow Payload persistence capabilities.

Global uniqueness SHALL only be imposed where the business invariant genuinely requires it.

---

# 66. Slug Collision

Two tenants MAY use identical slugs.

For example:

```text
Tenant A → /about
Tenant B → /about
```

This is normal.

Slug resolution SHALL always occur inside canonical scope.

---

# 67. Collection Configuration

Every new Payload collection SHALL explicitly declare whether it is:

- platform-global;
- tenant-owned;
- context-scoped;
- administrative/system-only.

A new collection SHALL NOT enter production with ambiguous tenancy behaviour.

Tenancy classification becomes part of schema review.

---

# 68. Globals

Payload globals SHALL require particular care.

A Payload "global" SHALL NOT automatically mean globally shared across Baobab.

Tenant-specific global-like settings, such as:

```text
site header
site footer
SEO defaults
brand configuration
```

SHALL still be tenant/digital-estate scoped.

Payload implementation terminology SHALL not override Baobab isolation semantics.

---

# 69. Audit Requirements

Tenant-sensitive operations SHALL create sufficient audit evidence to establish:

- actor;
- canonical tenant;
- legal entity where applicable;
- estate;
- market;
- resource;
- action;
- timestamp;
- correlation;
- privileged override where applicable.

Cross-tenant administrative operations SHALL be especially visible in audit records.

---

# 70. Observability

Operational telemetry SHALL include tenant/context information where appropriate and lawful.

Logs SHALL allow operators to diagnose tenant-specific failures without exposing sensitive content unnecessarily.

High-cardinality identifiers in metrics SHALL be managed carefully.

Tenant identity SHALL not be casually written into telemetry systems without considering privacy and operational cost.

---

# 71. Security Testing

Automated tests SHALL include adversarial isolation cases.

Testing only:

```text
Tenant A can read Tenant A
```

is insufficient.

Tests SHALL also prove:

```text
Tenant A cannot read Tenant B
Tenant A cannot update Tenant B
Tenant A cannot delete Tenant B
Tenant A cannot relate to Tenant B restricted content
Tenant A cannot fetch Tenant B media
Tenant A cannot receive Tenant B events
Tenant A cannot poison Tenant B cache
```

Negative tests are mandatory.

---

# 72. Conformance Matrix

At minimum, all tenant-aware content types SHALL demonstrate enforcement for:

| Concern | Required |
|---|---|
| Read isolation | Yes |
| Create isolation | Yes |
| Update isolation | Yes |
| Delete isolation | Yes |
| Relationship isolation | Yes |
| Media isolation | Where applicable |
| Search isolation | Where searchable |
| Cache isolation | Where cached |
| Event isolation | Where events emitted |
| Audit context | Yes |
| Import/export isolation | Where supported |

---

# 73. Failure Mode: Missing Context

If a tenant-scoped operation arrives without resolvable tenancy context, the Content Engine SHALL fail closed.

It SHALL NOT assume:

- default tenant;
- first tenant;
- host tenant from stale cache;
- platform scope.

Ambiguity is an error.

---

# 74. Failure Mode: Invalid Tenant

If a canonical tenant identifier is unknown, inactive or not bound to the requested engine capability, the operation SHALL be rejected.

Payload SHALL not opportunistically create a tenant projection merely because an unknown tenant ID appears in a request.

---

# 75. Failure Mode: Context Conflict

If trusted context dimensions conflict, the request SHALL fail.

Example:

```text
Tenant A
Digital Estate belonging to Tenant B
```

shall not be silently corrected.

The mismatch is security-relevant and SHOULD be observable.

---

# 76. Failure Mode: Stale Projection

If local tenant metadata is stale, behaviour SHALL follow an explicit consistency policy.

Sensitive operations SHOULD prefer failure over granting access on uncertain authority.

Staleness SHALL be detectable and reconcilable.

---

# 77. Failure Mode: Isolation Policy Unavailable

If the applicable `IsolationProfile` cannot be resolved for a privileged operation, the engine SHALL fail closed.

Security policy SHALL not degrade to permissive defaults because the Control Plane or projection is unavailable.

---

# 78. Local Development

Local development MAY use simplified tenant fixtures.

However, the development environment SHALL include multiple tenants so that isolation defects are detectable.

A one-tenant-only development fixture is insufficient for validating a multi-tenant engine.

At minimum, test fixtures SHOULD include:

```text
Tenant A
Tenant B
Platform Global
```

with overlapping slugs, locales and content names.

---

# 79. Testing Data

Test fixtures SHOULD deliberately create collision scenarios.

For example:

```text
Tenant A page slug: about
Tenant B page slug: about

Tenant A asset: logo.png
Tenant B asset: logo.png

Tenant A market: ZA
Tenant B market: ZA
```

If the implementation works only because test values are globally unique, the test suite is flattering the architecture rather than testing it.

---

# 80. Migration from Single-Tenant Content

If legacy content exists without canonical tenancy metadata, migration SHALL classify and assign ownership before enabling multi-tenant delivery.

Records SHALL NOT be automatically assigned to an arbitrary default tenant unless migration rules explicitly justify it.

Ambiguous records SHALL be quarantined for reconciliation.

---

# 81. Reconciliation

The platform SHALL support detecting tenancy anomalies such as:

```text
records without tenant ownership
invalid tenant references
cross-tenant relationships
content linked to inactive estates
content scoped to unauthorised markets
media ownership mismatches
stale tenant projections
orphaned tenant mappings
```

Reconciliation SHOULD be automated.

---

# 82. Backup Isolation

Shared-instance backups may contain multiple tenants.

Access to such backups SHALL therefore be considered cross-tenant privileged access.

Backup storage, restoration and operational handling SHALL follow stronger controls than ordinary tenant application access.

---

# 83. Tenant-Specific Restore

The architecture SHOULD eventually permit recovery of tenant-specific content without indiscriminately overwriting unrelated tenant state.

Where physical database architecture prevents simple tenant-level restore, recovery procedures SHALL define safe extraction/reconciliation methods.

---

# 84. Data Export Portability

Tenant-owned content SHOULD be exportable in a form that preserves:

- canonical IDs;
- scope;
- relationships;
- localisation;
- media references;
- version metadata where required.

This supports:

- tenant migration;
- dedicated-instance migration;
- regional migration;
- disaster recovery;
- eventual CMS replacement.

---

# 85. Dedicated Instance Migration

A tenant MAY migrate from shared to dedicated Payload infrastructure without changing canonical identity.

Conceptually:

```text
Before

Canonical Tenant A
       │
       ▼
Shared Payload Instance
```

becomes:

```text
After

Canonical Tenant A
       │
       ▼
Dedicated Payload Instance
```

Only `EngineInstance`, mappings, bindings and deployment data should materially change.

---

# 86. Merge Back

The reverse migration MAY also occur where justified.

Architecture SHALL therefore avoid assumptions that dedicated tenancy is permanent.

Canonical identity survives topology.

---

# 87. Rejected Alternative: Tenant per Collection

Rejected.

Creating separate collections such as:

```text
tenant_a_pages
tenant_b_pages
tenant_c_pages
```

creates schema duplication and operational divergence.

---

# 88. Rejected Alternative: Tenant per Codebase

Rejected as a universal architecture.

Separate codebases would:

- duplicate upgrades;
- fragment security fixes;
- encourage tenant-specific forks;
- undermine platform contracts.

Dedicated deployments may exist, but SHALL consume the same governed engine codebase wherever practical.

---

# 89. Rejected Alternative: Domain Equals Tenant

Rejected.

Domains change.

Tenants can own multiple domains.

Digital estates can change domains.

Non-HTTP integrations may have no domain.

---

# 90. Rejected Alternative: Legal Entity Equals Tenant

Rejected as a universal rule.

A legal entity is the default tenant boundary, not the definition of tenancy.

---

# 91. Rejected Alternative: Payload Instance Equals Tenant

Rejected.

Physical topology and organisational tenancy are separate concepts.

---

# 92. Rejected Alternative: Application Filters Only

Rejected.

Relying on developers to manually add:

```text
where: { tenant: ... }
```

to every query is too fragile for enterprise isolation.

Central enforcement and defence in depth are required.

---

# 93. Rejected Alternative: One Universal Superadmin

Rejected as the normal operating model.

A universally privileged CMS account creates unnecessary blast radius.

---

# 94. Rejected Alternative: Null Means Global

Rejected.

Ambiguous null tenant ownership is unsafe.

Platform-global scope SHALL be explicit.

---

# 95. Consequences

## 95.1 Positive

This architecture provides:

- tenant independence;
- legal-entity flexibility;
- estate isolation;
- market isolation;
- locale safety;
- regionalisation capability;
- infrastructure flexibility;
- migration between isolation models;
- clear Control Plane authority;
- reduced vendor lock-in;
- strong cross-tenant security posture.

---

## 95.2 Negative

The architecture requires:

- additional context resolution;
- policy enforcement;
- more sophisticated testing;
- mapping/projection management;
- tenancy-aware caching;
- tenancy-aware media;
- tenancy-aware events;
- explicit reconciliation.

These costs are accepted.

A multi-tenant CMS whose isolation model is "remember to filter the query" is inexpensive only until the first breach.

---

# 96. Architectural Invariants

The following are normative.

1. The Control Plane is authoritative for canonical tenancy.
2. Payload does not define independent canonical tenants.
3. Legal entity and tenant remain separate concepts.
4. Digital estate and tenant remain separate concepts.
5. Market and tenant remain separate concepts.
6. Locale and tenant remain separate concepts.
7. Every tenant-owned record has one canonical tenant owner.
8. Global content is explicitly classified.
9. Null tenant is not implicitly global.
10. Tenant IDs originate from trusted context.
11. Clients cannot self-assign tenant ownership.
12. Tenant-aware reads are automatically scoped.
13. Tenant-aware writes are validated.
14. Cross-tenant relationships are denied by default.
15. Media obeys tenant isolation.
16. Search obeys tenant isolation.
17. Cache keys obey tenant isolation.
18. Events carry tenant context.
19. Background jobs carry explicit context.
20. Scheduled publication preserves isolation.
21. Administrative users remain tenant-scoped unless explicitly privileged.
22. Superuser access is exceptional.
23. Domain names are not tenant identities.
24. Payload instances are not tenant identities.
25. Database topology is not tenant identity.
26. Isolation profile is policy-driven.
27. Tenant topology may change without changing canonical identity.
28. Unknown context fails closed.
29. Conflicting context fails closed.
30. New collections require explicit tenancy classification.
31. Tenant-specific core-code branches are prohibited.
32. Multi-tenant negative tests are mandatory.

---

# 97. Required Conformance Tests

## CT-001 — Tenant Read Isolation

Tenant A cannot retrieve Tenant B content through ordinary API or administrative operations.

## CT-002 — Tenant Write Isolation

Tenant A cannot create, update or delete Tenant B records.

## CT-003 — Client Tenant Spoofing

A caller cannot override trusted tenant context by supplying another tenant ID in a request payload.

## CT-004 — Cross-Tenant Relationship

Tenant A content cannot reference restricted Tenant B content.

## CT-005 — Media Isolation

Tenant A cannot retrieve private Tenant B media.

## CT-006 — Slug Collision

Two tenants may independently publish identical slugs without conflict or leakage.

## CT-007 — Digital Estate Isolation

Two estates within one tenant can independently own content under configured scope.

## CT-008 — Market Isolation

Market-specific resolution cannot expose another tenant's content.

## CT-009 — Locale Isolation

Locale fallback cannot cross tenant boundaries.

## CT-010 — Cache Isolation

Cached content from Tenant A cannot satisfy Tenant B requests.

## CT-011 — Search Isolation

Search results contain only content visible in authorised tenant context.

## CT-012 — Event Isolation

Tenant A subscribers do not receive Tenant B-only events.

## CT-013 — Background Job Isolation

Tenant-scoped jobs cannot operate on records belonging to another tenant.

## CT-014 — Missing Context

Tenant-required operations fail when no canonical context is available.

## CT-015 — Conflicting Context

A tenant/estate mismatch fails rather than being silently corrected.

## CT-016 — Platform Global

Explicitly platform-global content is resolvable only according to global-content policy.

## CT-017 — Null Scope

Unclassified null-tenant records are rejected or quarantined.

## CT-018 — Dedicated Migration

A tenant can migrate to another EngineInstance while retaining canonical identifiers.

---

# 98. Implementation Direction

The implementation SHALL derive a reusable Content Engine tenancy module rather than scattering tenancy logic throughout individual collections.

Conceptually:

```text
src/
├── baobab/
│   ├── context/
│   │   ├── resolver
│   │   ├── validator
│   │   └── types
│   │
│   ├── tenancy/
│   │   ├── access
│   │   ├── scope
│   │   ├── policies
│   │   ├── projections
│   │   └── isolation
│   │
│   ├── estates/
│   ├── markets/
│   ├── events/
│   ├── audit/
│   └── mappings/
│
└── collections/
```

Exact implementation structure may evolve.

The architectural requirement is centralised, reusable enforcement.

---

# 99. Child Decisions

This ADR deliberately leaves several areas for subsequent decisions.

At minimum, the following child ADRs SHALL address:

1. canonical content identity and external mappings;
2. digital-estate, market and locale inheritance;
3. Payload–Medusa product-content authority and composition;
4. media and object-storage isolation;
5. Payload authentication and authorisation;
6. event/outbox architecture;
7. deployment topology and regionalisation;
8. schema governance and migrations.

---

# 100. Decision Outcome

Payload CMS will operate as a multi-tenant Baobab Content Engine whose tenancy semantics originate outside Payload itself.

The core model is:

```text
                   BAOBAB CONTROL PLANE
                            │
                            ▼
                    Canonical Context
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
        Tenant        Digital Estate        Market
          │                 │                 │
          └─────────────────┼─────────────────┘
                            │
                            ▼
                     Isolation Profile
                            │
                            ▼
                    CONTENT ENGINE
                      Payload CMS
                            │
               ┌────────────┼────────────┐
               │            │            │
               ▼            ▼            ▼
          Tenant A      Tenant B      Tenant C
           Content       Content       Content
```

When stronger isolation is required:

```text
Canonical Tenant
       │
       ▼
Capability Binding
       │
       ▼
Dedicated EngineInstance
       │
       ▼
Payload + Dedicated Persistence
```

The key rule is therefore:

> **Baobab tenancy is a canonical platform concern that Payload enforces; it is not a Payload implementation detail that Baobab later attempts to interpret.**

That distinction allows the Content Engine to begin economically with shared infrastructure while retaining a credible path toward dedicated tenant, regional and jurisdictional isolation as Baobab grows.