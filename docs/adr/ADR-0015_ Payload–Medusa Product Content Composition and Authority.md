# ADR-0015: Payload–Medusa Product Content Composition and Authority

**Status:** Accepted  
**Date:** 2026-09-04  
**Decision Class:** Platform Architecture / Commerce Integration / Content Authority  
**Scope:** Baobab Content Engine and Baobab Trade Engine  
**Repositories:** `baobab-platform/baobab-cms`, `baobab-platform/baobab-trade`  
**Parent ADRs:**  
- `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`
- `ADR-0013-payload-canonical-content-identity-and-external-mapping.md`
- `ADR-0014-payload-digital-estate-market-locale-and-content-inheritance.md`

**Related Engines:** Baobab Control Plane, MedusaJS Trade Engine, Payload CMS Content Engine  
**Supersedes:** None  
**Architectural Style:** Canonical identity, strict authority boundaries, API/event composition, no shared persistence

---

# 1. Context

Baobab uses MedusaJS as the headless Trade Engine and Payload CMS as the headless Content Engine.

Both engines participate in presenting products to digital estates, but they own fundamentally different concerns.

A customer-facing product experience may need:

- title;
- marketing description;
- media;
- merchandising copy;
- SEO metadata;
- specifications;
- product variants;
- SKU;
- price;
- availability;
- inventory;
- sales-channel eligibility;
- promotions;
- currency;
- fulfilment information.

These concerns must not be indiscriminately duplicated across Medusa and Payload.

The architecture therefore requires a formal authority model for product data and a governed composition mechanism.

---

# 2. Problem Statement

A common CMS-commerce integration failure is to allow both systems to store full product records.

This results in:

```text
Medusa Product
      │
      │ duplicated
      ▼
Payload Product
```

where both systems contain:

```text
name
description
price
SKU
inventory
images
categories
availability
```

Over time the systems disagree.

Questions then arise:

- Which price is correct?
- Which SKU is authoritative?
- Which product is sellable?
- Which description should render?
- Which category determines navigation?
- Which system owns lifecycle?
- Which system publishes product changes?

Baobab SHALL avoid this dual-authority model.

---

# 3. Decision

Baobab SHALL implement a **split-authority product architecture**.

MedusaJS SHALL own **transactional commerce truth**.

Payload CMS SHALL own **editorial and presentation-oriented product content**.

The two representations SHALL be related using canonical Baobab product identity.

Conceptually:

```text
                 Canonical Product
                        │
             ┌──────────┴──────────┐
             │                     │
             ▼                     ▼
      Medusa Product        Payload ProductContent
             │                     │
             ▼                     ▼
      Commerce Truth         Editorial Truth
```

Digital estates SHALL compose the two through approved contracts.

---

# 4. Authority Principle

Each product concern SHALL have exactly one authoritative engine unless explicitly classified as derived or composed.

The architecture SHALL reject routine dual-write ownership.

---

# 5. Medusa Authority

Medusa SHALL be authoritative for commerce-operational product state, including where applicable:

- product existence for commerce;
- product variants;
- SKU;
- sales-channel eligibility;
- pricing;
- price lists;
- currency applicability;
- promotions;
- cart eligibility;
- orderability;
- inventory availability;
- stock-related sellability;
- fulfilment relationships;
- tax-relevant commerce configuration;
- transactional product lifecycle.

---

# 6. Payload Authority

Payload SHALL be authoritative for editorial product content, including where applicable:

- long-form descriptions;
- storytelling;
- merchandising narratives;
- editorial headings;
- product highlights;
- rich-content blocks;
- marketing copy;
- SEO title;
- SEO description;
- editorial media;
- buying guides;
- usage or preparation content;
- editorial specifications;
- campaign narratives;
- localised product copy;
- market-specific editorial content.

---

# 7. Control Plane Authority

The Control Plane SHALL remain authoritative for:

- canonical product identity;
- engine registration;
- engine-instance identity;
- mapping;
- mapping scope;
- tenant context;
- digital-estate context;
- market context;
- capability binding;
- isolation profile.

Neither Medusa nor Payload SHALL redefine these platform concerns.

---

# 8. Canonical Product Identity

A product participating across engines SHALL be represented by a canonical product entity.

Conceptually:

```text
CanonicalEntity
type = PRODUCT
```

with external references to the Medusa and Payload representations.

---

# 9. Medusa Product ID Is Not Canonical Product ID

Medusa product identifiers SHALL remain engine-local external references.

They SHALL NOT become canonical Baobab IDs.

---

# 10. Payload ProductContent ID Is Not Canonical Product ID

Likewise, Payload identifiers SHALL remain engine-local external references.

---

# 11. SKU Is Not Canonical Identity

SKU SHALL remain a commerce/business identifier.

It MAY assist matching and reconciliation.

It SHALL NOT automatically serve as canonical product identity.

---

# 12. Payload ProductContent

Payload SHOULD model product editorial data as a distinct content concept such as:

```text
ProductContent
```

rather than reproducing the complete Medusa product model.

Conceptually:

```text
ProductContent
--------------
id
canonical_product_id
tenant
digital_estate?
market?
locale?
headline?
short_description?
long_description?
editorial_media?
seo?
content_blocks?
publication_state
```

Exact schema is implementation-specific.

---

# 13. ProductContent Is Not a Commerce Product

The presence of a `ProductContent` record SHALL NOT mean the product can be sold.

Sellability remains a Trade Engine concern.

---

# 14. Commerce Product Without Editorial Content

A Medusa product MAY exist without a Payload representation.

Such a product may be:

- operationally valid;
- not yet editorially enriched;
- hidden by a digital estate;
- rendered with limited commerce-native information if policy permits.

The absence of Payload content SHALL NOT make the Medusa record invalid.

---

# 15. Editorial Content Without Active Commerce Product

Payload MAY contain draft editorial content before a product becomes commerce-active.

However, publication to a commerce digital estate SHOULD require a valid canonical product mapping where the content claims to represent a sellable product.

---

# 16. No Direct Database Access

Payload SHALL NOT read Medusa tables.

Medusa SHALL NOT read Payload tables.

Digital estates SHALL NOT join engine databases.

Integration SHALL occur through:

- APIs;
- canonical events;
- mapping services;
- approved projections;
- integration workers.

---

# 17. Composition Boundary

Product composition SHALL occur at a clearly defined service or digital-experience boundary.

The system SHALL avoid accidental composition scattered across frontend components.

---

# 18. Preferred Composition Model

The preferred conceptual flow is:

```text
Digital Estate
      │
      ▼
Canonical Product Identity
      │
      ├───────────────┐
      ▼               ▼
Trade API        Content API
      │               │
      ▼               ▼
Medusa Data     Payload Data
      │               │
      └───────┬───────┘
              ▼
      Composed Product View
```

---

# 19. Composition Does Not Create New Authority

The composed representation is a view.

It SHALL NOT become a third authoritative product record.

---

# 20. Commerce Lifecycle

Medusa SHALL own commerce lifecycle states relevant to selling.

Examples may include:

```text
draft
active
disabled
archived
```

or equivalent engine semantics.

Payload SHALL not override commerce lifecycle through editorial publication.

---

# 21. Editorial Lifecycle

Payload SHALL independently own editorial lifecycle.

For example:

```text
draft
review
published
unpublished
archived
```

A product may therefore be:

```text
commerce active
editorial draft
```

without architectural contradiction.

---

# 22. Effective Product Visibility

A digital estate MAY expose a product only when both commerce and content policies permit it.

Conceptually:

```text
Commerce Eligible
       AND
Editorially Eligible
       AND
Estate/Market Eligible
       =
Visible Product
```

Exact visibility policy is a digital-estate/product-experience concern.

---

# 23. Price Authority

All transactional prices SHALL originate from Medusa.

Payload SHALL NOT become the authoritative source of:

- base price;
- sale price;
- customer-specific price;
- currency price;
- price list;
- promotional calculation.

---

# 24. Displaying Price in Editorial Content

Editorial content MAY refer textually to price concepts, but hard-coded transactional prices SHOULD be avoided.

For example, Payload SHOULD prefer:

```text
"Contact us for wholesale pricing"
```

over:

```text
"R 199.99"
```

when the latter is expected to reflect live commerce state.

---

# 25. Inventory Authority

Inventory availability SHALL be derived from the Trade Engine or its authoritative downstream inventory integration.

Payload SHALL NOT determine stock availability.

---

# 26. SKU Authority

SKU SHALL be owned within the commerce/product operational model.

Payload MAY display or reference SKU.

It SHALL not independently modify authoritative SKU values.

---

# 27. Product Variant Authority

Medusa SHALL own product variants relevant to commerce.

Payload MAY attach editorial content to:

- the canonical product;
- specific canonical variants;
- product groups;

where mappings support such semantics.

---

# 28. Variant Editorial Content

If a variant needs separate editorial content, it SHOULD map to canonical variant identity rather than duplicate commerce state.

---

# 29. Title Authority

Product title requires a deliberate distinction.

Medusa MAY require an operational commerce title.

Payload MAY own editorial presentation titles.

Therefore:

```text
commerce_title
```

and:

```text
editorial_title
```

MAY differ.

Digital estates SHALL resolve which title to render according to presentation policy.

---

# 30. Product Description Authority

Rich product descriptions SHALL normally belong to Payload.

Medusa MAY retain a minimal operational description where required by commerce workflows.

Payload SHALL remain authoritative for rich editorial presentation.

---

# 31. Media Authority

Product imagery may originate from commerce or editorial workflows.

Baobab SHOULD distinguish:

- commerce-operational media;
- editorial presentation media.

The detailed media architecture SHALL be defined in ADR-0016.

---

# 32. SEO Authority

SEO metadata for product presentation SHALL belong to Payload unless explicitly delegated elsewhere.

Medusa SHALL not become the platform SEO authority merely because it owns the product.

---

# 33. Categories and Taxonomy

Commerce taxonomy and editorial taxonomy SHALL not be assumed identical.

Medusa may own commerce-facing product categorisation.

Payload may own editorial navigation or content taxonomy.

Canonical taxonomy mappings MAY relate the two where needed.

---

# 34. Category Duplication

Payload SHALL NOT copy Medusa categories merely to mirror the Trade Engine unless a deliberate projection is required.

---

# 35. Commerce Collections

Medusa collections or similar commerce grouping concepts SHALL remain commerce-owned.

Payload MAY provide editorial narratives for those groups using canonical mapping.

---

# 36. Merchandising

Editorial merchandising such as:

- hero products;
- featured products;
- editorial recommendations;
- campaign placement;
- storytelling order;

MAY be owned by Payload.

Transactional merchandising rules affecting actual price or sellability SHALL remain Medusa-owned.

---

# 37. Product Specifications

Product specifications SHALL be assigned authority based on semantics.

If a specification affects:

- ordering;
- SKU;
- variant;
- fulfilment;
- regulatory commerce behaviour;

it SHOULD be commerce/ERP sourced.

If it is editorial presentation metadata, Payload MAY own it.

Ambiguous fields SHALL require explicit authority assignment.

---

# 38. No Generic “Master Product Record”

Baobab SHALL NOT create a universal duplicate product record in the Control Plane.

The Control Plane SHALL identify and map.

It SHALL not absorb operational product state from all engines.

---

# 39. ERP Relationship

Where product/material information also exists in iDempiere:

```text
               Canonical Product
                /      |       \
               /       |        \
              ▼        ▼         ▼
          Medusa    Payload   iDempiere
```

authority SHALL still remain domain-specific.

iDempiere may own:

- accounting;
- procurement;
- costing;
- stock accounting;
- material master concerns;

according to ERP ADRs.

---

# 40. No Three-Way Data Mirroring

Baobab SHALL avoid blindly replicating full product state across:

```text
Medusa
Payload
iDempiere
```

Only contractually necessary projections SHALL cross boundaries.

---

# 41. Product Mapping

A valid product-content relationship SHALL use canonical mapping.

Unsafe:

```text
Payload product slug
   ==
Medusa product slug
```

Safe conceptually:

```text
Payload ProductContent
      │
      ▼
canonical_product_id
      │
      ▼
Canonical Product
      │
      ▼
Medusa ExternalReference
```

---

# 42. Mapping Scope

Product mappings SHALL respect:

- tenant;
- legal entity;
- digital estate where relevant;
- market where relevant;
- engine instance;
- effective validity.

---

# 43. Cross-Tenant Mapping

Payload product content for Tenant A SHALL NOT map to Tenant B's Medusa product by default.

Such mapping SHALL fail unless an explicit governed shared-resource model permits it.

---

# 44. Mapping Lifecycle

Product mappings SHALL support:

- activation;
- replacement;
- migration;
- retirement;
- reconciliation.

Deleting a Payload editorial record SHALL not automatically retire the canonical commerce product.

---

# 45. Product Creation Direction

Baobab SHALL NOT mandate that all products originate in Payload.

Likewise it SHALL NOT mandate that all canonical product identity originates from Payload.

Product creation authority depends on commerce/ERP workflow.

---

# 46. Preferred Commerce-Origin Flow

A common flow MAY be:

```text
Medusa Product Created
        │
        ▼
Canonical Product Resolved/Created
        │
        ▼
ExternalReference Registered
        │
        ▼
Content Enrichment Requested
        │
        ▼
Payload ProductContent
```

This is a workflow, not a universal hard-coded rule.

---

# 47. ERP-Origin Flow

Where ERP is authoritative for product/material creation, the flow MAY instead originate in iDempiere and later create commerce representation.

The canonical model SHALL support either direction.

---

# 48. Content-Origin Drafting

Payload MAY allow editorial teams to prepare product content before the commerce product exists.

Such records SHALL remain in a controlled unresolved state until canonical mapping is established.

---

# 49. Product Composition Contract

The platform SHOULD define a stable composed product contract for digital estates.

Conceptually:

```text
ComposedProduct
---------------
canonical_product_id

commerce:
  product
  variants
  pricing
  availability

content:
  title
  descriptions
  media
  seo
  blocks

context:
  tenant
  estate
  market
  locale
```

This is a read model, not an authority model.

---

# 50. Stable Composition API

Digital estates SHOULD consume stable Baobab contracts rather than engine-internal database schemas.

---

# 51. Direct Engine Consumption

A digital estate MAY directly consume Medusa or Payload APIs where architecture permits.

However, cross-engine identity SHALL still use canonical mappings.

---

# 52. Composition Location

Composition MAY be implemented through:

- Backend-for-Frontend;
- experience API;
- server-side digital estate;
- dedicated composition service.

The ADR does not mandate one implementation.

It mandates authority and identity boundaries.

---

# 53. No Browser Mapping Logic

Browsers SHALL NOT independently discover that:

```text
Medusa product 123
```

matches:

```text
Payload record 456
```

through naming conventions.

Mappings SHALL be resolved server-side or through trusted APIs.

---

# 54. Market-Aware Product Content

Payload MAY maintain market-specific editorial variations according to ADR-0014.

Medusa SHALL remain authoritative for commerce configuration associated with that market.

---

# 55. Locale-Aware Product Content

Payload SHALL own localised editorial product content.

Medusa commerce state SHOULD remain language-neutral wherever practical.

---

# 56. Currency

Currency and transactional amount SHALL remain commerce concerns.

Payload MAY contain currency-aware editorial wording but SHALL not calculate authoritative transactional amounts.

---

# 57. Promotions

Promotion eligibility and calculations SHALL belong to Medusa.

Payload MAY provide promotional copy and campaign content.

---

# 58. Promotion Composition

A campaign may therefore combine:

```text
Payload:
"Spring Wholesale Offer"

Medusa:
10% qualified discount
```

The marketing message and transaction rule remain separate authorities.

---

# 59. Promotion Expiry

Payload content SHOULD not continue claiming an active promotion when the Medusa promotion has expired.

This SHALL be mitigated through:

- validity windows;
- events;
- reconciliation;
- publication workflows;
- runtime composition.

---

# 60. Referential Integrity

Payload ProductContent referencing a canonical product SHOULD be validated against canonical mapping state.

Invalid mappings SHALL be detectable.

---

# 61. Product Deactivation

When a commerce product becomes inactive, Payload content SHALL not automatically be deleted.

It MAY remain:

- archived;
- unpublished;
- historically accessible;
- reusable after reactivation.

Lifecycle coupling SHALL be policy-driven.

---

# 62. Product Deletion

Hard deletion of commerce products SHOULD be exceptional where canonical references exist.

Retirement/archival is generally safer than destructive deletion.

---

# 63. Content Deletion

Deleting editorial content SHALL not delete transactional commerce product state.

---

# 64. Event Integration

Medusa SHALL publish canonical commerce events.

Payload SHALL publish canonical content events.

Examples may include:

```text
commerce.product.created
commerce.product.updated
commerce.product.activated
commerce.product.retired
```

and:

```text
content.product.created
content.product.updated
content.product.published
content.product.unpublished
```

Exact event names SHALL follow shared event contracts.

---

# 65. Event Independence

Payload SHALL not treat every Medusa event as an instruction to mirror the entire product record.

Events SHALL trigger only contractually defined reactions.

---

# 66. Product Creation Event

A product-created event MAY trigger:

- mapping creation;
- editorial task creation;
- ProductContent stub creation;
- indexing;
- reconciliation.

These reactions SHALL be idempotent.

---

# 67. Product Update Event

A commerce product update SHALL only update Payload projections for fields Payload does not own and actually requires.

---

# 68. No Event Ping-Pong

The architecture SHALL prevent:

```text
Medusa update
   ↓
Payload mirrors
   ↓
Payload update event
   ↓
Medusa mirrors
   ↓
...
```

Authority boundaries SHALL break feedback loops.

---

# 69. Event Origin Metadata

Events SHALL identify:

- source engine;
- source instance;
- canonical product ID;
- tenant/context;
- correlation;
- causation.

---

# 70. Projection

Payload MAY maintain a minimal commerce projection for editorial convenience.

For example:

```text
CommerceProductProjection
-------------------------
canonical_product_id
status
sku_summary
variant_summary
last_synced_at
```

Such a projection SHALL remain non-authoritative.

---

# 71. Projection Purpose

A projection MAY improve:

- editorial search;
- linking;
- preview;
- validation.

It SHALL not replace Medusa for live transactional decisions.

---

# 72. Projection Freshness

Projection staleness SHALL be detectable.

Payload SHALL not silently treat stale projection data as authoritative transactional truth.

---

# 73. Product Preview

Editorial preview MAY combine:

- draft Payload content;
- current Medusa commerce state.

The preview system SHALL clearly distinguish draft content from live commerce state.

---

# 74. Draft Product Content

Draft editorial changes SHALL not alter commerce behaviour until separately enacted through the appropriate Trade Engine workflow.

---

# 75. Search

Product search may combine commerce and editorial attributes.

Search architecture SHALL preserve authority metadata and tenant isolation.

Search indexes SHALL be projections, not new authorities.

---

# 76. Analytics

Analytics systems MAY consume composed product events and dimensions.

Analytics SHALL not become the operational source of truth for commerce or content.

---

# 77. Caching

Composed product responses MAY be cached.

Cache keys SHALL account for:

- tenant;
- digital estate;
- market;
- locale;
- canonical product;
- relevant pricing/customer context.

Transactional pricing SHALL not be cached in an unsafe context-insensitive way.

---

# 78. Customer-Specific Pricing

Customer-specific or contract-specific pricing SHALL be resolved through Medusa or its approved commerce integrations.

Payload SHALL never precompute authoritative personalised price.

---

# 79. Public Product Cache

Public editorial product content may be cached aggressively.

Personalised commerce information requires stricter cache partitioning.

---

# 80. Failure: Content Engine Unavailable

If Payload is unavailable, a digital estate MAY:

- serve limited commerce-native product information;
- serve cached editorial content;
- hide enriched content;

according to product-experience policy.

Medusa availability SHALL not depend on Payload database availability.

---

# 81. Failure: Trade Engine Unavailable

If Medusa is unavailable, Payload MAY still serve non-transactional product editorial content.

The digital estate SHALL not falsely represent unavailable commerce operations as valid.

---

# 82. Failure Isolation

Neither engine SHALL require synchronous availability of the other for unrelated internal operations.

For example, an editor SHOULD be able to draft product copy even if Medusa is temporarily unavailable, subject to mapping availability.

---

# 83. Mapping Resolver Failure

Where composition requires canonical mapping and the mapping resolver is unavailable, the system SHALL use approved cached projections or fail explicitly.

It SHALL not match products by slug as an emergency fallback.

---

# 84. Reconciliation

Product reconciliation SHALL detect at minimum:

- Medusa products lacking canonical mappings;
- Payload ProductContent lacking mappings;
- canonical products missing expected representations;
- cross-tenant mapping;
- retired products with active editorial publication;
- stale commerce projections;
- duplicate mappings;
- invalid variant relationships.

---

# 85. Editorial Reconciliation

Reconciliation MAY also identify:

```text
active commerce products without published editorial content
```

as an operational quality signal.

This is not necessarily an architectural error.

---

# 86. Commerce Reconciliation

Likewise:

```text
published product content without active commerce product
```

SHOULD be detectable.

Whether it is allowed depends on publication policy.

---

# 87. Import

Bulk product imports SHALL respect authority.

Commerce imports affecting SKU, price, variants or sellability SHALL target the Trade/ERP path.

Editorial imports SHALL target Payload.

---

# 88. Export

Product exports SHALL identify which fields originate from:

- Medusa;
- Payload;
- ERP;
- derived composition.

This prevents downstream consumers from confusing projection with authority.

---

# 89. Schema Evolution

Payload product-content schema MAY evolve independently of Medusa commerce schema.

Canonical identity provides the stable bridge.

---

# 90. Engine Upgrade Independence

Medusa and Payload SHALL be independently upgradeable where contracts remain compatible.

An upgrade to one SHALL not require coordinated database migration in the other.

---

# 91. Security

Payload editorial permissions SHALL not grant commerce administration permissions.

Medusa commerce administration SHALL not automatically grant CMS editorial authority.

---

# 92. Service Credentials

Engine-to-engine integrations SHALL use dedicated service identities with least privilege.

Shared administrator credentials are prohibited.

---

# 93. Tenant Isolation

All product composition SHALL preserve the tenancy rules established by ADR-0012.

A product from Tenant A SHALL never be composed with Tenant B editorial content.

---

# 94. Digital Estate Isolation

Content resolution SHALL respect digital-estate scope under ADR-0014.

A shared commerce product MAY receive different editorial presentation across authorised estates.

---

# 95. Market Isolation

The same canonical product MAY have different editorial content and commerce configuration across markets.

The two are resolved independently and composed under the same canonical context.

---

# 96. Example

Conceptually:

```text
Canonical Product:
  Ethiopian Green Coffee

Medusa:
  SKU = ETH-GREEN-60KG
  price = market-specific
  inventory = available
  variant = 60kg bag

Payload:
  headline = "Traceable Ethiopian Green Coffee"
  origin story = ...
  tasting notes = ...
  hero image = ...
  SEO description = ...

Digital Estate:
  Zuribeans B2B

Market:
  South Africa

Locale:
  en-ZA
```

The rendered page is composed.

Neither engine becomes subordinate to the other.

---

# 97. Rejected Alternative: Payload Owns Entire Product

Rejected because Payload is not Baobab's transactional commerce engine.

---

# 98. Rejected Alternative: Medusa Owns Entire Product Experience

Rejected because commerce operational state and rich editorial content have different lifecycle, governance and localisation requirements.

---

# 99. Rejected Alternative: Duplicate Full Product in Both Engines

Rejected due to dual authority and synchronisation conflict.

---

# 100. Rejected Alternative: Shared Product Database

Rejected because it violates engine isolation and independent deployment.

---

# 101. Rejected Alternative: Slug-Based Mapping

Rejected because slugs are mutable and context-scoped.

---

# 102. Rejected Alternative: SKU-Based Universal Mapping

Rejected because SKU is a commerce identifier, not canonical platform identity.

---

# 103. Rejected Alternative: Frontend-Owned Mapping

Rejected because digital estates should consume platform mappings, not recreate them.

---

# 104. Rejected Alternative: Payload Pricing

Rejected for transactional prices.

Editorial wording about offers does not transfer pricing authority.

---

# 105. Rejected Alternative: Commerce Events as Full CMS Synchronisation

Rejected because it recreates the entire commerce domain inside Payload.

---

# 106. Consequences

## 106.1 Positive

This decision provides:

- clear product authority;
- reduced data duplication;
- independent engine scaling;
- independent upgrades;
- better editorial capability;
- canonical cross-engine identity;
- cleaner digital-estate composition;
- reduced synchronisation loops;
- replaceable engines.

## 106.2 Negative

The architecture introduces:

- composition logic;
- canonical mappings;
- multiple APIs;
- projection management;
- event coordination;
- reconciliation requirements.

These costs are accepted.

---

# 107. Architectural Invariants

1. Medusa owns transactional commerce product truth.
2. Payload owns editorial product-content truth.
3. The Control Plane owns canonical product identity and mappings.
4. Payload IDs are not canonical product IDs.
5. Medusa IDs are not canonical product IDs.
6. SKU is not universal canonical identity.
7. Payload does not authoritatively price products.
8. Payload does not authoritatively manage inventory.
9. Payload does not authoritatively manage sellability.
10. Medusa does not become the rich editorial CMS.
11. Full product records are not blindly mirrored across engines.
12. Product composition is a read concern, not a new authority.
13. Cross-engine product matching uses canonical mappings.
14. Direct cross-engine SQL is prohibited.
15. Cross-tenant product mapping is prohibited by default.
16. Market and locale resolution remain context-aware.
17. Commerce and editorial lifecycle remain separate.
18. Engine events do not create uncontrolled mirror loops.
19. Projections are non-authoritative.
20. Digital estates do not invent product mappings.
21. Engine upgrades remain independently deployable.
22. Product reconciliation is mandatory.

---

# 108. Required Conformance Tests

## CT-001 — Canonical Mapping

A Medusa product and Payload ProductContent resolve to the same canonical product where configured.

## CT-002 — No SKU Mapping Assumption

Identical SKU-like values across incompatible scopes do not automatically create mappings.

## CT-003 — Price Authority

Changing Payload content cannot alter authoritative Medusa pricing.

## CT-004 — Inventory Authority

Changing Payload content cannot alter Medusa inventory.

## CT-005 — Editorial Authority

Changing Medusa operational fields does not overwrite Payload-owned long-form editorial content.

## CT-006 — Cross-Tenant Protection

Tenant A Payload content cannot compose with Tenant B Medusa product.

## CT-007 — Independent Lifecycle

Unpublishing Payload content does not delete the Medusa product.

## CT-008 — Commerce Deactivation

Deactivating a Medusa product does not physically delete Payload editorial content.

## CT-009 — Projection Staleness

A stale Payload commerce projection is detectable.

## CT-010 — No Direct SQL

Neither engine requires direct database access to the other.

## CT-011 — Composition Context

Product composition respects tenant, estate, market and locale.

## CT-012 — Engine Failure Isolation

Payload editorial drafting remains possible during a Trade Engine outage where required local dependencies remain available.

## CT-013 — Mapping Failure

Mapping resolution failure does not fall back to slug/title matching.

## CT-014 — Event Idempotency

Repeated commerce product events do not create duplicate editorial projections.

## CT-015 — Reconciliation

Missing, duplicate and invalid product mappings are detectable.

---

# 109. Implementation Direction

A suitable conceptual separation is:

```text
baobab-cms
└── src/
    └── baobab/
        ├── product-content/
        │   ├── collections/
        │   ├── resolution/
        │   └── policies/
        ├── commerce/
        │   ├── client/
        │   ├── projections/
        │   └── events/
        ├── mappings/
        ├── context/
        └── reconciliation/
```

and on the digital-estate side:

```text
Digital Estate
    │
    ▼
Product Experience Layer
    │
    ├── canonical mapping
    ├── Medusa commerce view
    └── Payload editorial view
```

Exact package structure remains implementation-specific.

---

# 110. Decision Outcome

Baobab SHALL treat a customer-facing product as a **composition of specialised authoritative representations**, not as a single database row copied between engines.

The governing model is:

```text
                        Canonical Product
                               │
              ┌────────────────┼────────────────┐
              │                │                │
              ▼                ▼                ▼
          iDempiere          Medusa           Payload
              │                │                │
              ▼                ▼                ▼
        ERP / Finance       Commerce        Editorial
           Truth             Truth            Truth
              │                │                │
              └────────────────┼────────────────┘
                               ▼
                      Digital Estate
                               │
                               ▼
                    Composed Product View
```

The architectural rule is therefore:

> **Compose authority; do not duplicate it.**

Payload enriches the product experience.

Medusa governs the commerce transaction.

iDempiere governs its ERP responsibilities.

The Control Plane ensures that all three know which canonical product they are talking about.