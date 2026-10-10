# ADR-0013: Payload Canonical Content Identity and External Mapping

**Status:** Accepted  
**Date:** 2026-09-04  
**Decision Class:** Platform Architecture / Content Management / Canonical Identity  
**Scope:** Baobab Content Engine  
**Repository:** `baobab-platform/baobab-cms`  
**Parent ADRs:**  
- `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`
- `ADR-0012-payload-multi-tenancy-and-content-isolation-architecture.md`

**Related Contracts:** Baobab Canonical Mapping Model; Baobab Control Plane Physical Data Model; `baobab-platform/shared` canonical schemas  
**Supersedes:** None

---

# 1. Context

Baobab is a polyrepo, polyglot platform in which specialised engines retain authority over their respective operational domains.

Payload CMS owns editorial content.

MedusaJS owns commerce state.

iDempiere owns ERP state.

The Baobab Control Plane owns canonical platform topology, engine registration, contexts, capability bindings and canonical mapping governance.

Consequently, the same real-world or conceptual object may legitimately have representations in several engines.

For example:

```text
                    Canonical Product
                           │
             ┌─────────────┼─────────────┐
             │             │             │
             ▼             ▼             ▼
          Medusa         Payload      iDempiere
          Product        Product       Product/
                         Content       Material
```

These engine records are related.

They are not necessarily identical.

No engine-specific identifier can therefore safely serve as Baobab-wide identity.

---

# 2. Problem Statement

Payload naturally generates identifiers for records.

Content systems also expose convenient identifiers such as:

- collection IDs;
- slugs;
- URLs;
- filenames;
- paths;
- titles;
- database primary keys;
- locale-specific slugs;
- internal relationship IDs.

It would be tempting to expose one of these as the identity of a Baobab content object.

That would introduce several architectural problems.

For example:

```text
Payload ID
    =
Baobab Identity
```

would make Payload replacement, regionalisation, migration and multiple engine instances difficult.

Likewise:

```text
slug
   =
identity
```

would fail as soon as a slug changes.

And:

```text
SKU
   =
canonical product identity
```

would incorrectly elevate a mutable domain identifier into a platform identity.

Baobab therefore requires an explicit distinction between:

1. canonical identity;
2. engine-local identity;
3. business identifiers;
4. routing identifiers;
5. mappings between representations.

---

# 3. Decision

Baobab SHALL use the **Canonical Mapping Model** as the exclusive architectural mechanism for relating Payload records to canonical platform entities and representations in other engines.

The governing relationship SHALL be:

```text
CanonicalEntity
      │
      ├── ExternalReference ──► Payload Record
      │
      ├── ExternalReference ──► Medusa Record
      │
      └── ExternalReference ──► iDempiere Record
      │
      ▼
    Mapping
      │
      ▼
 MappingScope
```

Payload internal identifiers SHALL remain external identifiers from the perspective of the Baobab canonical model.

They SHALL NOT become canonical Baobab identity merely because Payload created the object first.

---

# 4. Identity Classes

Baobab SHALL explicitly distinguish four identity classes.

## 4.1 Canonical Identity

Canonical identity represents a stable platform-level identity.

Example:

```text
canonical_entity_id:
0198e750-...
```

Canonical IDs SHALL be:

- globally unique;
- immutable;
- opaque;
- independent of engine implementation;
- independent of database topology;
- independent of URL;
- independent of tenant display name;
- independent of market;
- independent of locale.

---

## 4.2 External Engine Identity

An external identity identifies a representation inside a particular engine instance.

For example:

```text
engine        = payload
engine_instance = payload-africa-south-01
external_id   = 67c9...
```

The meaning of `external_id` belongs to that engine.

Baobab SHALL treat it as opaque.

---

## 4.3 Business Identifier

Business identifiers have domain meaning.

Examples include:

```text
SKU
product code
article number
supplier code
document number
campaign code
```

They MAY participate in matching and reconciliation.

They SHALL NOT automatically become canonical identity.

---

## 4.4 Routing Identifier

Routing identifiers exist to locate or present resources.

Examples include:

```text
/about
/products/ethiopian-coffee
/news/2026/harvest-report
```

Routing identifiers SHALL NOT serve as canonical identity.

---

# 5. CanonicalEntity

`CanonicalEntity` SHALL represent an identity whose meaning must survive implementation boundaries.

A conceptual model is:

```text
CanonicalEntity
---------------
id
entity_type
lifecycle_state
created_at
updated_at
```

The canonical entity SHALL contain only information necessary for platform-level identity and governance.

It SHALL NOT become a shadow copy of Payload content.

---

# 6. CanonicalEntity Is Not a Universal Data Record

The Control Plane SHALL NOT replicate complete Payload records into `CanonicalEntity`.

For example, this is prohibited:

```text
CanonicalEntity
├── title
├── body
├── hero_image
├── SEO description
├── blocks
├── publication date
└── ...
```

for the purpose of reproducing Payload.

The preferred relationship is:

```text
CanonicalEntity
      │
      │ identity
      ▼
ExternalReference
      │
      ▼
Payload
      │
      └── actual editorial state
```

The canonical layer identifies and relates.

The Content Engine stores editorial truth.

---

# 7. Which Payload Objects Require Canonical Identity?

Not every Payload record necessarily requires a canonical entity.

Canonicalisation SHALL be driven by interoperability and lifecycle requirements.

A Payload object SHOULD receive canonical identity where it:

- crosses engine boundaries;
- is referenced by multiple digital estates;
- participates in platform events;
- requires long-lived identity;
- participates in mappings;
- may migrate between Payload instances;
- must survive CMS replacement;
- is referenced externally;
- requires platform-level audit or reconciliation.

---

# 8. Candidate Canonical Content Types

Likely canonical content entities include:

```text
Page
Article
Campaign
MediaAsset
Document
Navigation
TaxonomyTerm
ProductContent
LegalNotice
ContentFragment
```

This list is extensible.

The existence of a Payload collection SHALL NOT automatically require a new canonical entity type.

---

# 9. Engine-Internal Records

Purely implementation-specific records MAY remain Payload-local.

Examples may include:

- temporary drafts;
- internal processing records;
- cache metadata;
- plugin configuration;
- internal workflow state;
- ephemeral upload state.

Creating canonical entities for every database row is explicitly discouraged.

Canonicalisation has operational cost and SHALL have architectural purpose.

---

# 10. ExternalReference

An `ExternalReference` SHALL identify an engine-owned representation.

Conceptually:

```text
ExternalReference
-----------------
id
canonical_entity_id
engine_id
engine_instance_id
external_type
external_id
lifecycle_state
observed_at
```

For Payload:

```text
Canonical Page
      │
      ▼
ExternalReference
      │
      ├── engine = PAYLOAD
      ├── engine_instance = PAYLOAD-SA-01
      ├── external_type = page
      └── external_id = <opaque Payload ID>
```

---

# 11. Engine Instance Is Part of External Identity

An external identifier SHALL NOT be assumed globally unique across all instances of an engine.

Therefore:

```text
Payload ID: 123
```

is insufficient.

The effective identity is conceptually:

```text
Engine
+
EngineInstance
+
ExternalType
+
ExternalID
```

This allows multiple Payload installations to coexist safely.

---

# 12. External IDs Are Opaque

Baobab components SHALL NOT parse semantic information from Payload identifiers.

Prohibited assumptions include:

```text
Payload ID prefix identifies tenant
Payload ID range identifies region
Payload ID contains creation date
Payload ID encodes content type
```

Even where such properties happen to be true in a particular Payload version, they SHALL NOT form part of the platform contract.

---

# 13. Canonical UUID Strategy

Canonical entities SHALL use the UUID strategy established by the Control Plane implementation contract.

Payload SHALL consume canonical IDs as opaque values.

Payload SHALL NOT generate an incompatible competing canonical identifier scheme.

Where UUIDv7 is established by the parent Control Plane contract, Payload SHALL preserve that representation without attempting to reinterpret ordering semantics as business meaning.

---

# 14. Mapping

A `Mapping` SHALL represent a governed relationship between external representations and/or their canonical entity.

Mappings SHALL support lifecycle and temporal governance.

A mapping SHALL answer:

> Which engine representation corresponds to which canonical entity under what scope and during what period?

Mappings SHALL NOT merely be informal lookup tables.

---

# 15. MappingScope

`MappingScope` SHALL constrain mapping applicability.

Scope may include:

- tenant;
- legal entity;
- digital estate;
- market;
- engine instance;
- context;
- temporal validity.

This prevents an external reference valid in one operating context from being incorrectly reused elsewhere.

---

# 16. Tenant-Aware Mapping

Mappings SHALL respect tenancy.

A Payload record belonging to Tenant A SHALL NOT map to a Tenant B canonical entity unless an explicit governed cross-tenant sharing relationship permits it.

Mapping creation SHALL validate tenant compatibility.

---

# 17. Mapping and Isolation Are Separate

A mapping does not grant access.

This is fundamental.

```text
Mapping exists
     ≠
Actor authorised
```

Canonical mapping resolves identity.

Authorisation resolves permission.

Payload access control SHALL still enforce the effective Baobab context.

---

# 18. One Canonical Entity, Multiple External Representations

A canonical entity MAY have multiple external references.

Example:

```text
Canonical Product
      │
      ├── Medusa Product
      ├── Payload ProductContent
      └── iDempiere Product
```

This is a primary reason the canonical mapping layer exists.

---

# 19. Multiple Payload Representations

A canonical entity MAY also have multiple Payload representations where architecture requires it.

For example:

```text
Canonical Page
      │
      ├── Payload SA Instance
      │      └── external record
      │
      └── Payload EA Instance
             └── external record
```

Such duplication SHALL be governed explicitly.

The system SHALL NOT assume that multiple external references mean duplicate errors.

---

# 20. Representation Versus Entity

A Payload content record may represent editorial information about another canonical entity rather than being that entity itself.

For example:

```text
CanonicalEntity
type = PRODUCT
```

may map to:

```text
Medusa Product
```

while Payload stores:

```text
ProductContent
```

The Payload record is an editorial representation associated with the canonical product.

It does not redefine product authority.

---

# 21. Product Content Example

The canonical relationship SHOULD resemble:

```text
                   Canonical Product
                         │
              ┌──────────┼──────────┐
              │                     │
              ▼                     ▼
       ExternalReference      ExternalReference
              │                     │
              ▼                     ▼
       Medusa Product       Payload ProductContent
              │                     │
              ▼                     ▼
        Commerce Truth        Editorial Truth
```

Digital estates compose both representations.

---

# 22. No Matching by Display Name

Records SHALL NOT be canonically matched merely because names are equal.

Unsafe:

```text
Medusa:
"Arabica Green Coffee"

Payload:
"Arabica Green Coffee"

therefore same entity
```

Names are mutable and non-unique.

They may be used as reconciliation hints only.

---

# 23. No Matching by Slug

Slugs SHALL NOT establish canonical equivalence.

Two unrelated tenants may legitimately have:

```text
/products/coffee
```

and one entity may change slug over time.

---

# 24. No Matching by URL

URLs are presentation and routing concerns.

They SHALL NOT be canonical identity.

Domain changes, redirects and digital-estate migrations SHALL not change canonical identity.

---

# 25. No Matching Solely by SKU

SKU may be a strong business identifier within a commerce context.

Nevertheless:

```text
SKU == canonical entity ID
```

is prohibited.

SKU semantics may vary across:

- tenants;
- legal entities;
- ERP organisations;
- markets;
- product variants;
- legacy systems.

SKU MAY be used as evidence during mapping creation.

---

# 26. Canonical Content Identity Versus Localisation

A translation does not automatically require a separate canonical entity.

For example:

```text
Canonical Article
      │
      ├── en-ZA
      ├── en-UG
      └── sw-UG
```

may remain one canonical entity with localised representations.

Separate canonical identities SHOULD be created only where the records represent independently governed content rather than translations or contextual variants.

---

# 27. Market Variants

Market-specific variants similarly SHALL NOT automatically create new canonical identity.

For example:

```text
Canonical Campaign
      │
      ├── ZA representation
      └── UG representation
```

may remain one entity where they represent the same governed campaign.

If market versions have independent lifecycle and meaning, separate canonical entities MAY be appropriate.

This decision SHALL be determined by domain semantics, not database convenience.

---

# 28. Version Identity

A new content revision SHALL NOT ordinarily create a new canonical entity.

Conceptually:

```text
Canonical Page
     │
     ├── Version 1
     ├── Version 2
     └── Version 3
```

remains one canonical page.

Payload version identifiers are revision identifiers, not canonical entity identifiers.

---

# 29. Clone Identity

A deliberate content clone SHALL ordinarily receive a new canonical identity if it acquires an independent lifecycle.

For example:

```text
Original Campaign
      │
      └── Canonical ID A

Clone for independent campaign
      │
      └── Canonical ID B
```

Provenance MAY record that B was derived from A.

---

# 30. Canonical Identity Is Immutable

Once assigned, canonical entity identity SHALL NOT change because of:

- title change;
- slug change;
- URL change;
- locale change;
- domain migration;
- Payload upgrade;
- database migration;
- regional relocation;
- engine-instance migration.

---

# 31. Payload Instance Migration

Suppose content moves from:

```text
Payload Instance A
```

to:

```text
Payload Instance B
```

The canonical identity SHALL remain unchanged.

The mapping evolves:

```text
CanonicalEntity
      │
      ├── old ExternalReference
      │      Payload A / ID 123
      │
      └── new ExternalReference
             Payload B / ID 874
```

The old mapping MAY be temporally closed rather than destroyed.

---

# 32. CMS Replacement

The same rule applies if Payload is eventually replaced.

```text
CanonicalEntity
      │
      ├── Payload representation
      │
      └── Future CMS representation
```

Baobab's canonical identity survives vendor replacement.

This is a central architectural benefit of the mapping model.

---

# 33. Temporal Mapping

Mappings SHOULD support validity periods.

Conceptually:

```text
valid_from
valid_to
```

This enables Baobab to determine which representation was authoritative or applicable at a given time.

Historical mappings SHOULD not simply disappear when engine migrations occur.

---

# 34. Non-Overlapping Active Mappings

Where business semantics require one active representation for a given canonical entity, engine, type and scope, the persistence layer SHALL prevent overlapping active mappings.

Temporal exclusion constraints defined by the Control Plane physical model SHOULD enforce this invariant where appropriate.

---

# 35. Mapping Lifecycle

Mappings SHALL support lifecycle states equivalent to:

```text
PROPOSED
ACTIVE
SUPERSEDED
RETIRED
INVALID
```

or the canonical lifecycle vocabulary established in `baobab-platform/shared`.

A mapping SHALL not be physically deleted merely because it is no longer active unless retention policy explicitly permits deletion.

---

# 36. Mapping Creation

Mappings MAY originate through:

- controlled creation workflow;
- engine onboarding;
- migration;
- reconciliation;
- trusted integration;
- administrative resolution.

Automatic mapping SHALL only occur where deterministic matching rules exist.

---

# 37. Ambiguous Matching

If more than one canonical entity plausibly matches an external Payload record, the system SHALL NOT guess.

The result SHALL be:

```text
AMBIGUOUS
```

or equivalent reconciliation state.

Human or governed automated resolution SHALL be required.

Wrong mappings are worse than missing mappings because they manufacture false identity.

---

# 38. Mapping Confidence

Where probabilistic or heuristic matching is used during migration or reconciliation, confidence MAY be recorded.

For example:

```text
match_method = sku+tenant
confidence = 0.98
```

Such confidence metadata SHALL NOT transform an unapproved candidate into an authoritative mapping unless policy permits automatic acceptance.

---

# 39. Mapping Provenance

The system SHOULD record how a mapping was established.

Possible provenance includes:

```text
MANUAL
MIGRATION
DETERMINISTIC
RECONCILIATION
IMPORT
SYSTEM
```

This improves auditability and remediation.

---

# 40. Mapping Authority

The Control Plane mapping service SHALL be authoritative for canonical mappings.

Payload MAY cache or project mappings.

Payload SHALL NOT maintain an independent canonical mapping universe.

---

# 41. Resolver Service

Canonical identity resolution SHALL be exposed through a bounded resolver service.

Conceptually:

```text
resolve external reference
        │
        ▼
Mapping Resolver
        │
        ▼
Canonical Entity
```

and:

```text
resolve canonical entity
        │
        ▼
Mapping Resolver
        │
        ▼
applicable external references
```

Engines SHALL NOT query Control Plane mapping tables directly.

---

# 42. Resolver Inputs

Resolution MAY include:

```text
engine
engine_instance
external_type
external_id
tenant
mapping_scope
effective_time
```

depending on the operation.

The resolver SHALL reject ambiguous results where a unique result is required.

---

# 43. Resolver Outputs

A successful resolution SHOULD return enough information to establish:

- canonical entity ID;
- canonical entity type;
- applicable mapping;
- mapping scope;
- external reference;
- lifecycle status;
- effective validity.

It SHALL NOT unnecessarily return full engine-owned content.

---

# 44. Payload Local Projection

Payload MAY store the canonical entity ID locally to avoid resolver calls for every operation.

For example:

```text
ProductContent
--------------
id
canonical_entity_id
tenant_id
...
```

This field is a projection/reference.

It does not transfer canonical authority to Payload.

---

# 45. Projection Validation

Locally stored canonical references SHALL be validated at creation or synchronisation time.

Payload SHALL not accept arbitrary canonical IDs from untrusted clients.

---

# 46. Projection Staleness

Local projections MAY become stale.

The architecture SHALL therefore support:

- synchronisation;
- validation;
- reconciliation;
- lifecycle invalidation.

Sensitive mapping decisions SHOULD use authoritative resolution when necessary.

---

# 47. Event Identity

Canonical events SHALL prefer canonical entity IDs as resource identity.

Example:

```text
event_type: content.published
canonical_entity_id: ...
```

Payload's local record ID MAY additionally appear as:

```text
external_reference
```

for diagnostics and reconciliation.

---

# 48. Event Stability

A consumer SHALL remain able to identify the same canonical resource even after the Payload record migrates to another engine instance.

This is another reason canonical event identity SHALL not depend on Payload IDs.

---

# 49. API Identity

Baobab-facing APIs SHOULD expose canonical IDs where interoperability requires them.

Payload-native administrative APIs MAY continue using Payload IDs internally.

The distinction is:

```text
Payload API
     → engine-native identity permitted

Baobab integration contract
     → canonical identity preferred
```

---

# 50. Digital Estate Consumption

Digital estates SHOULD consume canonical identity where they compose multiple engines.

For example:

```text
Digital Estate
      │
      ├── canonical product ID
      │        │
      │        ├── resolve commerce representation
      │        └── resolve content representation
      │
      ▼
Composed Product Experience
```

The frontend SHALL NOT be responsible for inventing cross-engine mappings.

---

# 51. Mapping Service Failure

If canonical resolution is required and unavailable, the operation SHALL follow an explicit degradation policy.

The system SHALL NOT guess equivalence from names, slugs or IDs merely because the resolver is temporarily unavailable.

For authoritative mutations, failure SHOULD generally be closed.

---

# 52. Orphaned Payload Records

A canonicalisable Payload record without a valid canonical mapping SHALL be detectable.

Depending on content type and policy, it MAY:

- remain draft-only;
- be quarantined;
- be prevented from publishing;
- enter reconciliation;
- be allowed temporarily during migration.

The behaviour SHALL be explicit.

---

# 53. Orphaned Canonical Entities

Likewise, a canonical entity expected to have Payload representation but lacking one SHALL be detectable.

This supports questions such as:

```text
Which active products have no editorial content?
```

or:

```text
Which digital-estate pages lost their Payload representation?
```

---

# 54. Duplicate External References

An external representation SHALL NOT simultaneously map to incompatible canonical entities within overlapping scope.

The Control Plane SHALL enforce uniqueness where semantics require it.

---

# 55. Mapping Reconciliation

Reconciliation SHALL detect at minimum:

- orphaned external references;
- missing canonical entities;
- duplicate active mappings;
- overlapping temporal mappings;
- invalid tenant relationships;
- stale engine instances;
- mismatched entity types;
- references to retired resources.

---

# 56. Entity-Type Compatibility

Mappings SHALL validate compatible entity types.

For example:

```text
Payload ProductContent
        ↔
Canonical Product
```

may be valid.

But:

```text
Payload ProductContent
        ↔
Canonical LegalEntity
```

should fail unless a specifically defined semantic relationship exists.

Generic mapping machinery SHALL not eliminate domain validation.

---

# 57. Relationship Identity

Payload relationships SHOULD use canonical identity where relationships cross engine or persistence boundaries.

Payload-local relationships MAY use native IDs when both resources belong entirely to the same Content Engine boundary.

This prevents unnecessary canonicalisation while preserving interoperability.

---

# 58. Media Identity

Media requiring long-lived cross-estate or cross-engine reference SHOULD receive canonical identity.

Storage keys and URLs SHALL not serve as media identity.

Therefore:

```text
Canonical MediaAsset
       │
       ▼
Payload Media Record
       │
       ▼
Object Storage Object
```

remain separate layers.

---

# 59. Object Replacement

Replacing the physical binary backing a media asset does not necessarily change canonical media identity.

Whether replacement constitutes a new canonical asset depends on semantic lifecycle rules.

Physical object identity and business/content identity SHALL remain separate.

---

# 60. Navigation Identity

Navigation structures MAY receive canonical identity where referenced across deployments or digital estates.

Individual ephemeral navigation items need not automatically become canonical entities.

Canonicalisation SHALL remain purposeful.

---

# 61. Taxonomy Identity

Taxonomy terms used across systems SHOULD receive canonical identity.

For example:

```text
Canonical TaxonomyTerm
      │
      ├── Payload editorial taxonomy
      └── future search/analytics representation
```

Labels remain localisable attributes rather than identity.

---

# 62. Identity and Publication State

Canonical identity SHALL exist independently of publication state.

A record may transition:

```text
DRAFT
  ↓
PUBLISHED
  ↓
UNPUBLISHED
  ↓
ARCHIVED
```

without changing canonical identity.

---

# 63. Identity and Deletion

Deleting a Payload representation SHALL NOT automatically delete the canonical entity.

Deletion must distinguish:

```text
delete representation
```

from:

```text
retire canonical entity
```

These are separate lifecycle operations.

---

# 64. Canonical Entity Retirement

Canonical retirement SHALL occur through the authoritative platform lifecycle.

Payload MAY request or trigger workflows, but SHALL NOT silently retire canonical entities merely because local content was deleted.

---

# 65. Referential Integrity During Retirement

Before retiring a mapping or canonical entity, the platform SHOULD identify dependent references.

Examples include:

- digital estates;
- navigation;
- product composition;
- events;
- media relationships;
- external integrations.

Retirement SHALL not casually manufacture dangling references.

---

# 66. Import Behaviour

Imported content SHALL not automatically retain foreign canonical IDs unless the import is explicitly trusted as a canonical migration.

Ordinary imports SHALL create or resolve identity according to controlled rules.

---

# 67. Export Behaviour

Exports intended for migration SHOULD preserve:

- canonical entity ID;
- external reference;
- mapping metadata;
- tenant;
- scope;
- lifecycle;
- relevant version information.

This permits reliable rehydration elsewhere.

---

# 68. Cross-Tenant Copy

When content is copied from Tenant A to Tenant B, the destination SHALL ordinarily receive a new canonical entity if it becomes independently owned.

The original canonical identity SHALL not be reused merely because the content text is identical.

---

# 69. Shared Platform Content

Explicit platform-global content MAY retain one canonical identity across tenants where the resource genuinely has one shared lifecycle.

This SHALL be a deliberate governance decision.

---

# 70. Audit

Identity and mapping operations SHALL be auditable.

Audit SHOULD capture:

- actor/system principal;
- operation;
- canonical entity;
- external reference;
- previous mapping;
- resulting mapping;
- tenant;
- scope;
- timestamp;
- correlation ID;
- provenance.

---

# 71. Security

Mapping mutation is a privileged operation.

A user capable of changing mappings could otherwise cause one tenant or engine representation to masquerade as another.

Mapping APIs SHALL therefore use strong authorisation and validation.

---

# 72. No Client-Controlled Canonical Mapping

Public frontend clients SHALL NOT be permitted to arbitrarily declare:

```text
this Payload record maps to canonical entity X
```

Mapping establishment belongs to trusted platform workflows.

---

# 73. Database Isolation

Payload SHALL not query the Control Plane database to resolve mappings.

The Control Plane SHALL not query Payload tables.

Integration occurs through explicit service contracts and events.

---

# 74. Shared Contracts

`baobab-platform/shared` SHALL define portable mapping schemas and identifier representations required across repositories.

The Control Plane SHALL implement authoritative mapping behaviour.

Payload SHALL implement the Content Engine side of those contracts.

---

# 75. Contract Versioning

Mapping contracts SHALL be versioned.

A breaking change to canonical identity representation, mapping scope or external-reference semantics SHALL require governed contract evolution.

---

# 76. Observability

Mapping operations SHOULD expose telemetry including:

- resolution latency;
- resolution failures;
- ambiguous mappings;
- orphan counts;
- reconciliation failures;
- stale projections.

Operational telemetry SHALL not expose sensitive content unnecessarily.

---

# 77. Caching

Mapping resolution MAY be cached.

Cache entries SHALL account for:

- canonical entity;
- external reference;
- tenant;
- scope;
- engine instance;
- lifecycle;
- temporal validity.

Cache invalidation SHALL occur when authoritative mapping state changes.

---

# 78. Negative Caching

Missing mappings MAY be negatively cached for short periods where appropriate.

Negative caches SHALL not prevent newly created mappings from becoming visible within acceptable consistency bounds.

---

# 79. Migration

Existing Payload records introduced before canonical mapping SHALL undergo explicit identity migration.

Migration SHALL:

1. inventory candidate records;
2. determine canonicalisation requirements;
3. establish tenant/context;
4. identify deterministic matches;
5. create canonical entities where required;
6. create external references;
7. establish mappings;
8. quarantine ambiguities;
9. reconcile;
10. verify referential integrity.

---

# 80. Idempotent Mapping Creation

Mapping creation APIs SHALL support idempotent behaviour.

Repeated submission of the same valid mapping intent SHALL not create duplicate canonical mappings.

---

# 81. Concurrency

Concurrent attempts to establish conflicting mappings SHALL be resolved through database constraints and transaction-safe service behaviour.

"Last request wins" is not an acceptable canonical identity strategy.

---

# 82. Rejected Alternative: Payload ID as Canonical ID

Rejected because it couples platform identity to the CMS implementation.

---

# 83. Rejected Alternative: Slug as Canonical ID

Rejected because slugs are mutable, scoped and presentation-oriented.

---

# 84. Rejected Alternative: URL as Canonical ID

Rejected because URLs change and belong to digital-estate routing.

---

# 85. Rejected Alternative: SKU as Universal Canonical ID

Rejected because SKU is domain-specific and not universally unique or immutable across Baobab.

---

# 86. Rejected Alternative: Duplicate Canonical Data in Every Engine

Rejected because canonical authority would become ambiguous.

Engines may project canonical IDs but SHALL not independently redefine them.

---

# 87. Rejected Alternative: Mapping by Convention

Rejected.

Patterns such as:

```text
same slug = same entity
same SKU = same entity
same title = same entity
```

are insufficient as platform contracts.

---

# 88. Rejected Alternative: Frontend Mapping

Rejected.

Digital estates SHALL consume mappings, not invent them.

---

# 89. Rejected Alternative: Direct Database Mapping

Rejected.

Cross-engine persistence coupling violates Baobab engine isolation.

---

# 90. Consequences

## 90.1 Positive

The decision provides:

- stable cross-engine identity;
- CMS replaceability;
- engine-instance migration;
- regional deployment;
- temporal history;
- reliable reconciliation;
- clean Medusa integration;
- clean ERP integration;
- digital-estate composition;
- protection against mutable identifiers becoming architecture.

## 90.2 Negative

The architecture introduces:

- mapping-service dependency;
- additional persistence;
- reconciliation requirements;
- lifecycle complexity;
- migration work;
- projection synchronisation;
- additional contract testing.

These costs are accepted because distributed systems require explicit identity. Avoiding the mapping layer would not eliminate the problem; it would merely hide it in application code.

---

# 91. Architectural Invariants

The following are normative.

1. Canonical identity is independent of Payload.
2. Payload IDs are external identifiers.
3. Slugs are not canonical IDs.
4. URLs are not canonical IDs.
5. Titles are not canonical IDs.
6. SKUs are not automatically canonical IDs.
7. Canonical IDs are immutable.
8. Engine instance participates in external-reference identity.
9. External IDs are opaque.
10. Canonical entities do not duplicate full Payload state.
11. Not every Payload row requires canonical identity.
12. Cross-engine entities require explicit mappings.
13. Mappings are tenant-aware.
14. Mappings do not grant authorisation.
15. Mapping lifecycle is explicit.
16. Mapping history is preservable.
17. Ambiguous mappings fail rather than guess.
18. Engine migrations do not change canonical identity.
19. CMS replacement does not change canonical identity.
20. Content revisions ordinarily retain canonical identity.
21. Independent clones ordinarily receive new canonical identity.
22. Publication state does not determine identity.
23. Deleting a Payload representation does not automatically delete canonical identity.
24. Mapping mutation is privileged.
25. Public clients cannot arbitrarily establish mappings.
26. Engines do not query each other's mapping tables.
27. Resolver services form the mapping boundary.
28. Mapping contracts are organisation-wide contracts.
29. Reconciliation is mandatory.
30. Mapping creation is idempotent.

---

# 92. Required Conformance Tests

## CT-001 — Stable Identity After Slug Change

Changing a Payload slug does not change canonical identity.

## CT-002 — Stable Identity After Title Change

Changing content title does not change canonical identity.

## CT-003 — Stable Identity After Engine Migration

Moving a record between Payload engine instances preserves canonical identity.

## CT-004 — Multiple Representations

One canonical product can resolve to both Medusa and Payload representations.

## CT-005 — Tenant Mapping Isolation

Tenant A cannot establish a mapping to an incompatible Tenant B entity.

## CT-006 — Duplicate Mapping Prevention

Conflicting active mappings cannot be created for an exclusive scope.

## CT-007 — Idempotent Creation

Repeated identical mapping requests produce one effective mapping.

## CT-008 — Ambiguous Resolution

Ambiguous resolution fails explicitly.

## CT-009 — External ID Opacity

No integration depends on parsing Payload ID structure.

## CT-010 — Revision Stability

Creating a new Payload revision preserves canonical identity.

## CT-011 — Independent Clone

An independently governed clone receives a distinct canonical identity.

## CT-012 — Representation Deletion

Deleting the Payload representation does not silently delete its canonical entity.

## CT-013 — Resolver Isolation

Payload resolves mappings through the approved service contract rather than Control Plane SQL.

## CT-014 — Event Identity

Canonical content events remain identifiable after Payload-instance migration.

## CT-015 — Mapping Reconciliation

Orphaned and conflicting mappings are detectable.

---

# 93. Implementation Direction

The Payload implementation SHOULD expose a bounded integration package resembling:

```text
src/
└── baobab/
    ├── identity/
    │   ├── canonical.ts
    │   ├── external-reference.ts
    │   └── types.ts
    │
    ├── mappings/
    │   ├── client.ts
    │   ├── resolver.ts
    │   ├── projection.ts
    │   ├── validation.ts
    │   └── reconciliation.ts
    │
    ├── context/
    ├── events/
    └── audit/
```

Exact file structure is non-normative.

The architectural boundary is normative.

---

# 94. Conceptual Resolution Flow

For a Payload-originating event:

```text
Payload Record
      │
      ▼
Local Canonical Projection
      │
      ├── valid ────────────────┐
      │                         │
      └── absent/stale          │
              │                 │
              ▼                 │
       Mapping Resolver         │
              │                 │
              ▼                 │
       CanonicalEntity ◄────────┘
              │
              ▼
       Canonical Event
```

For digital-estate composition:

```text
Canonical Product ID
       │
       ▼
Mapping Resolver
       │
       ├──────────────┐
       ▼              ▼
Medusa Reference   Payload Reference
       │              │
       ▼              ▼
Commerce Data     Editorial Data
       │              │
       └──────┬───────┘
              ▼
      Digital Experience
```

---

# 95. Ownership Matrix

| Concern | Authority |
|---|---|
| Canonical entity identity | Baobab Control Plane |
| Canonical mapping contracts | `baobab-platform/shared` |
| Mapping persistence/lifecycle | Baobab Control Plane |
| Mapping resolution | Control Plane Resolver Service |
| Payload external identity | Payload CMS |
| Editorial content | Payload CMS |
| Commerce product state | MedusaJS |
| ERP product/material state | iDempiere |
| Digital-estate routing | Digital Estate / Control Plane configuration |
| Authorisation | Baobab context + engine policy |
| Mapping reconciliation | Control Plane + participating engine adapters |

---

# 96. Decision Outcome

The Baobab Content Engine SHALL participate in a canonical identity system without becoming its authority.

The final distinction is:

```text
WHAT IS IT?
     │
     ▼
CanonicalEntity
     │
     │
WHERE IS ITS REPRESENTATION?
     │
     ▼
ExternalReference
     │
     │
HOW ARE REPRESENTATIONS RELATED?
     │
     ▼
Mapping
     │
     │
WHERE/WHEN DOES THAT RELATIONSHIP APPLY?
     │
     ▼
MappingScope
```

For Payload specifically:

```text
                 BAOBAB CANONICAL ENTITY
                          │
                ┌─────────┼─────────┐
                │                   │
                ▼                   ▼
        ExternalReference    ExternalReference
                │                   │
                ▼                   ▼
         PAYLOAD INSTANCE      OTHER ENGINE
                │
                ▼
          Payload Record
```

Payload owns the editorial representation.

The Control Plane owns canonical identity and mapping governance.

`baobab-platform/shared` owns the portable contracts through which both sides agree on that meaning.

Neither Payload IDs, URLs, slugs, titles nor convenient business identifiers are permitted to quietly become Baobab's platform identity.

That boundary is what allows today's Payload deployment to become tomorrow's regional deployment—or eventually an entirely different CMS—without forcing Baobab to redefine what its entities are.