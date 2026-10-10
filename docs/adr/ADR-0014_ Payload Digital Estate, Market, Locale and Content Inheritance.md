# ADR-0014: Payload Digital Estate, Market, Locale and Content Inheritance

**Status:** Accepted  
**Date:** 2026-09-04  
**Decision Class:** Platform Architecture / Content Management / Content Resolution  
**Scope:** Baobab Content Engine  
**Repository:** `baobab-platform/baobab-cms`  
**Parent ADRs:**  
- `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`
- `ADR-0012-payload-multi-tenancy-and-content-isolation-architecture.md`
- `ADR-0013-payload-canonical-content-identity-and-external-mapping.md`

**Supersedes:** None  
**Related Contracts:** Baobab Canonical Mapping Model; Baobab Control Plane Context and Mapping Contracts; `baobab-platform/shared` content-context schemas  
**Architectural Style:** Context-aware, deterministic, inheritance-driven content resolution

---

# 1. Context

The Baobab Content Engine must serve content across multiple:

- tenants;
- legal entities;
- digital estates;
- markets;
- locales;
- regions;
- brands;
- channels;
- customer experiences.

Payload CMS provides the storage and editorial capabilities necessary for this content.

However, Payload by itself does not define Baobab's canonical rules for determining which content representation applies to a particular digital estate, market and locale.

For example, a digital estate may request the home page under the following context:

```text id="hcx91r"
Tenant:           Thamani
Legal Entity:     Thamani Global
Digital Estate:   thamani-storefront
Market:           ZA-B2C
Locale:           en-ZA
```

The Content Engine may hold:

```text id="934d2v"
Tenant-wide home page
Digital-estate-specific home page
South Africa market home page
English South Africa home page
Platform fallback home page
```

Baobab therefore requires a deterministic and auditable content-resolution model.

---

# 2. Problem Statement

Without explicit inheritance and precedence rules, the same content request may produce inconsistent results.

A naïve implementation might:

```text id="1ufj03"
query all matching pages
sort by updated_at
take first
```

or:

```text id="gwq5xf"
use locale fallback
then market fallback
then tenant fallback
```

without a governed hierarchy.

Such behaviour would be unsafe because:

- retrieval order is not business policy;
- newer content is not automatically more specific;
- locale and market precedence may conflict;
- tenant isolation may accidentally be bypassed;
- estate-specific content may be shadowed unexpectedly;
- global content may leak into contexts where it should not apply;
- editorial users may not understand why a particular version is rendered.

The platform therefore requires a canonical resolution algorithm.

---

# 3. Decision

Baobab SHALL implement a **deterministic, context-aware content inheritance and resolution model**.

The resolution hierarchy SHALL conceptually follow:

```text id="u3ycha"
Platform
   │
   ▼
Tenant
   │
   ▼
Legal Entity
   │
   ▼
Digital Estate
   │
   ▼
Market
   │
   ▼
Locale
```

This hierarchy represents increasing contextual specificity.

However, inheritance SHALL NOT be assumed merely because these dimensions exist.

Each content type SHALL explicitly define:

- which scope dimensions apply;
- whether inheritance is allowed;
- whether child scope overrides parent scope;
- whether multiple applicable records may be composed;
- whether absence causes fallback or failure.

---

# 4. Content Resolution Principle

For a given canonical content concept, the Content Engine SHALL select the **most specific valid representation allowed by policy**.

Conceptually:

```text id="g7wkkv"
exact context match
      │
      ▼
less specific authorised match
      │
      ▼
configured fallback
      │
      ▼
no content
```

The engine SHALL NOT resolve content by:

- database row order;
- latest timestamp;
- record ID;
- arbitrary query order;
- first available locale;
- implicit tenant assumptions.

---

# 5. Scope Dimensions

The canonical content resolution model SHALL recognise, where applicable:

```text id="gjkmbd"
tenant_id
legal_entity_id
digital_estate_id
market_id
locale
```

Additional dimensions MAY be introduced through governed contracts where required, but the core resolver SHALL not depend on tenant-specific custom dimensions.

---

# 6. Platform Scope

Platform-scoped content applies across Baobab only where explicitly allowed.

Examples may include:

- shared platform notices;
- system documentation;
- common legal or technical information.

Platform scope SHALL be explicit.

A missing tenant reference SHALL NOT automatically create platform scope.

---

# 7. Tenant Scope

Tenant-scoped content applies across contexts owned by the same tenant subject to narrower overrides.

For example:

```text id="70i92w"
Tenant: Thamani
Footer legal notice
```

may serve multiple digital estates unless overridden.

Tenant-scoped content SHALL never apply to another tenant.

---

# 8. Legal Entity Scope

Legal-entity scope MAY refine tenant scope where a tenant includes multiple legal entities.

Example:

```text id="flgjp2"
Tenant: Nabhold Group
Legal Entity: Subsidiary A
```

A legal-entity-specific record SHALL override a broader tenant-scoped record where the content type permits override inheritance.

---

# 9. Digital Estate Scope

Digital estate scope SHALL represent presentation or experience-specific content ownership.

For example:

```text id="dzxnfg"
Tenant-wide navigation
```

may be overridden by:

```text id="qk7ywm"
Zuribeans digital-estate navigation
```

without creating a different tenant.

---

# 10. Market Scope

Market scope SHALL represent commercial or operating applicability.

A market MAY encode:

- geography;
- currency;
- channel;
- customer segment;
- regulatory context;
- brand;
- strategic configuration.

Market SHALL NOT be reduced to country.

---

# 11. Locale Scope

Locale SHALL represent linguistic and regional presentation context.

Locales such as:

```text id="2dtksp"
en
en-ZA
en-UG
sw
sw-UG
```

SHALL be distinct canonical locale identifiers.

Fallback between locales SHALL be explicitly configured.

---

# 12. Locale Is Not Market

The platform SHALL preserve:

```text id="fc1nc7"
locale != market
```

For example:

```text id="h187oz"
en-ZA
```

does not itself imply:

```text id="8102j2"
South Africa market
```

Likewise, a South African market may support multiple locales.

---

# 13. Market Is Not Region

The platform SHALL preserve:

```text id="d2mkk6"
market != deployment region
```

A market may be served from one or more infrastructure regions.

Content-resolution semantics SHALL not depend on physical hosting topology.

---

# 14. Digital Estate Is Not Domain

Digital-estate identity SHALL remain canonical.

A domain may resolve to a digital estate, but:

```text id="me4aeh"
domain != digital estate
```

A digital estate may change domain without changing its content identity or inheritance rules.

---

# 15. Specificity Ordering

Where all dimensions are applicable, specificity SHALL increase conceptually as follows:

```text id="kbcv47"
Platform
   <
Tenant
   <
Legal Entity
   <
Digital Estate
   <
Market
   <
Locale
```

This ordering describes contextual narrowing.

It does not imply that every content type uses every level.

---

# 16. Content-Type Resolution Policy

Each governed content type SHALL declare a resolution policy.

Conceptually:

```text id="mgxptj"
ContentResolutionPolicy
-----------------------
content_type
supported_scopes
inheritance_mode
override_mode
fallback_policy
composition_mode
locale_policy
market_policy
```

Exact physical representation is implementation-specific.

---

# 17. Inheritance Modes

Content types SHALL support explicit inheritance behaviour equivalent to:

```text id="6e0xsl"
NONE
INHERIT
OVERRIDE
COMPOSE
```

---

# 18. NONE

`NONE` means the content must exist at the requested scope.

No broader record is inherited.

Example:

```text id="nwjmyy"
market-specific regulatory disclosure
```

may require an exact market representation.

---

# 19. INHERIT

`INHERIT` means a broader valid representation may be used if no narrower representation exists.

Example:

```text id="re2xa4"
Tenant footer
      ↓
Digital estate inherits footer
```

unless overridden.

---

# 20. OVERRIDE

`OVERRIDE` means a more specific record replaces the applicable broader record.

For example:

```text id="7e52fv"
Tenant navigation
       ↓
Estate navigation override
```

The final result contains the estate-specific representation.

---

# 21. COMPOSE

`COMPOSE` means multiple scope levels may contribute content.

Example:

```text id="k5xjna"
Tenant navigation
      +
Market promotional links
      +
Estate-specific links
```

Composition SHALL follow a deterministic merge policy.

---

# 22. Content Resolution Is Per Type

The platform SHALL NOT define one universal inheritance mode for all Payload collections.

Pages, navigation, SEO defaults, legal notices, campaigns and product editorial content may require different policies.

Uniformity is desirable only where semantics justify it.

---

# 23. Exact-Match Resolution

For an exact request context:

```text id="nfxi39"
tenant = A
legal_entity = B
estate = C
market = D
locale = E
```

the resolver SHALL first search for the most specific valid representation supported by that content type.

---

# 24. Fallback Resolution

Where exact content does not exist and fallback is allowed, the resolver SHALL traverse only policy-approved fallback paths.

The resolver SHALL NOT invent fallback order dynamically.

---

# 25. Deterministic Fallback

A fallback chain MAY conceptually resemble:

```text id="q7yx5b"
Estate + Market + Locale
        ↓
Estate + Market
        ↓
Estate + Locale
        ↓
Estate
        ↓
Legal Entity
        ↓
Tenant
        ↓
Platform
```

but the exact sequence SHALL be defined per content type and locale policy.

---

# 26. Fallback Graph

Fallback MAY form a graph rather than a simple linear chain.

For example:

```text id="kt4xri"
en-ZA
  │
  ├──► en
  │
  └──► configured tenant default locale
```

The resolver SHALL prevent fallback cycles.

---

# 27. Locale Fallback

Locale fallback SHALL be explicit and deterministic.

For example:

```text id="pyw1r5"
en-ZA → en
sw-UG → sw
```

may be valid.

But:

```text id="x6v6qd"
en-ZA → en-US
```

SHALL not occur unless explicitly configured.

---

# 28. Locale Fallback Cannot Cross Tenants

Locale fallback SHALL remain inside the authorised tenant/context boundary.

The resolver SHALL never search unrelated tenant content because a locale representation is missing.

---

# 29. Tenant Default Locale

A tenant MAY define a default locale.

This default SHALL be configuration, not implicit platform behaviour.

Different tenants may have different defaults.

---

# 30. Digital Estate Default Locale

A digital estate MAY override the tenant default locale where policy permits.

For example:

```text id="tpd5dk"
Tenant default: en
Estate default: sw
```

The resolver SHALL honour configured scope precedence.

---

# 31. Market Default Locale

A market MAY also define allowed or preferred locales.

This SHALL not automatically override estate policy unless the resolution contract explicitly states it.

---

# 32. Supported Locale Validation

A request for a locale unsupported by the resolved digital estate or market SHALL fail or fall back according to policy.

The engine SHALL not silently serve arbitrary language variants.

---

# 33. Default Market

A digital estate MAY define a default market.

This is an operational convenience.

It SHALL NOT mean that market context may always be omitted.

Operations requiring explicit market semantics SHALL require explicit market resolution.

---

# 34. Market Fallback

Market fallback SHALL be explicit.

The platform SHALL NOT assume:

```text id="92fetk"
country market
    ↓
regional market
    ↓
global
```

unless configured by policy.

---

# 35. Regulatory Content

Regulatory content SHOULD ordinarily use strict resolution.

For example:

```text id="2y7brt"
market-specific legal disclosure
```

SHOULD fail rather than inherit a broader disclosure where doing so could be misleading or unlawful.

---

# 36. Marketing Content

Marketing and editorial content MAY use broader inheritance.

For example:

```text id="yu8izr"
tenant campaign banner
```

may be inherited where no market-specific version exists.

---

# 37. Product Editorial Content

Product editorial content MAY combine:

- tenant baseline;
- estate-specific merchandising;
- market-specific descriptions;
- locale-specific copy.

The detailed Medusa/Payload authority boundary SHALL be defined in ADR-0015.

---

# 38. Navigation Resolution

Navigation MAY use composition.

For example:

```text id="mormtj"
Tenant core navigation
        +
Estate-specific links
        +
Market campaign links
```

Where composition is allowed, merge order SHALL be deterministic.

---

# 39. SEO Defaults

SEO configuration MAY use hierarchical inheritance.

Conceptually:

```text id="8rmjlx"
Tenant SEO defaults
        ↓
Estate SEO defaults
        ↓
Page SEO overrides
```

A missing page-level value may inherit from estate or tenant policy.

---

# 40. Page Content

Page content SHOULD ordinarily use replace semantics rather than structural composition unless the page model explicitly supports inherited blocks.

A more specific page representation SHALL generally replace the broader representation.

---

# 41. Reusable Content Fragments

Reusable fragments MAY be referenced across narrower contexts where scope permits.

A shared fragment SHALL retain its own canonical identity.

Embedding or referencing it SHALL not transfer ownership.

---

# 42. Content Applicability

A content record SHALL have explicit applicability metadata.

Conceptually:

```text id="cfytjc"
ContentApplicability
--------------------
tenant
legal_entity?
digital_estate?
market?
locale?
effective_from?
effective_to?
```

Optional dimensions depend on content type.

---

# 43. Temporal Applicability

Content MAY have effective validity periods.

This enables:

```text id="7fufqc"
campaign valid from X to Y
legal notice effective from date Z
seasonal navigation
```

Resolution SHALL consider temporal validity before applying inheritance.

---

# 44. Temporal Specificity

A future scheduled record SHALL not override the currently effective record before its activation time.

Likewise, expired content SHALL not remain eligible merely because it is more specific.

---

# 45. Publication State

Only content in an eligible publication state SHALL participate in public resolution.

Draft, archived or otherwise non-deliverable content SHALL be excluded unless a preview or administrative context explicitly permits it.

---

# 46. Preview Resolution

Preview operations MAY resolve draft content.

Preview SHALL use the same scope and inheritance model as published content, except for publication-state eligibility.

This prevents preview from behaving differently from eventual production delivery.

---

# 47. Canonical Identity During Overrides

A more specific representation may either:

- share canonical identity with a broader semantic entity; or
- represent an independently governed canonical entity.

This decision SHALL follow ADR-0013 identity semantics.

Scope specificity alone SHALL not automatically create new canonical identity.

---

# 48. Explicit Override Linkage

Where a record overrides another representation, the relationship SHOULD be detectable.

For example:

```text id="qi1p63"
Market-specific page
    overrides
Tenant page
```

This improves editor understanding, auditability and reconciliation.

---

# 49. Orphan Overrides

A narrower record MAY remain valid even if its broader source is retired, depending on content semantics.

The platform SHALL not automatically delete narrower representations when a parent representation is removed.

---

# 50. Override Does Not Mean Inheritance of Ownership

A market-specific override remains owned by its canonical tenant.

Content inheritance SHALL never cross tenant ownership boundaries.

---

# 51. Cross-Legal-Entity Inheritance

Inheritance across legal entities within one tenant SHALL be prohibited by default unless policy explicitly permits it.

Shared content SHOULD normally be modelled at the broader tenant scope instead.

---

# 52. Cross-Tenant Inheritance

Implicit cross-tenant inheritance is prohibited.

If content genuinely needs sharing across tenants, it SHALL use explicit platform-global or governed shared-content mechanisms.

---

# 53. Shared Content

Shared content SHALL have explicit scope.

The platform SHALL distinguish:

```text id="03pdur"
shared because globally governed
```

from:

```text id="25xjrr"
accidentally visible because tenant is null
```

These are not equivalent.

---

# 54. Content Resolution Request

A canonical resolution request SHOULD include:

```text id="x342mi"
canonical content identity or content key
tenant
legal_entity?
digital_estate
market?
locale?
effective_time?
preview_mode?
```

The exact API contract SHALL be defined separately.

---

# 55. Content Key

Some resolution operations MAY begin from a stable content key.

Examples:

```text id="nrnbst"
home
footer
primary-navigation
privacy-policy
```

A content key SHALL be scoped and governed.

It SHALL not become a universal canonical entity ID.

---

# 56. Content Keys Are Not Global by Default

For example:

```text id="tdk82l"
home
```

may exist independently in many tenants and estates.

Uniqueness SHALL therefore include relevant scope.

---

# 57. Resolver Responsibility

The content resolver SHALL be responsible for:

- validating context;
- identifying eligible representations;
- enforcing tenant isolation;
- applying scope policy;
- applying temporal validity;
- applying publication-state rules;
- applying inheritance;
- applying fallback;
- returning deterministic results.

---

# 58. Resolver Shall Not Perform Authoring

The resolver determines applicable content.

It SHALL NOT mutate editorial content during resolution.

---

# 59. Resolver Shall Not Invent Context

If required context cannot be determined, resolution SHALL fail.

The resolver SHALL not invent:

- tenant;
- market;
- estate;
- locale.

Defaults MAY only be applied where explicitly configured.

---

# 60. Resolver Inputs Must Be Trusted

Canonical context SHOULD be resolved before content selection.

Client-provided values SHALL be validated against:

- tenant;
- capability binding;
- digital estate;
- market;
- locale eligibility.

---

# 61. Context Consistency

The resolver SHALL reject inconsistent context.

Examples include:

```text id="6q38ja"
Estate belonging to Tenant A
Tenant = Tenant B
```

or:

```text id="c8yv6a"
Market not available to selected estate
```

where such compatibility constraints are defined.

---

# 62. Resolver Output

A resolved response SHOULD identify:

- selected canonical content entity;
- Payload representation;
- effective scope;
- inherited-from scope where applicable;
- locale;
- market;
- publication state;
- resolution metadata.

This supports observability and editorial debugging.

---

# 63. Resolution Trace

The system SHOULD support an explainable resolution trace.

For example:

```text id="0m4wj9"
Requested:
estate=zuribeans
market=ZA-B2B
locale=en-ZA

Checked:
1. estate+market+locale → none
2. estate+market → none
3. estate+locale → match

Selected:
content_id=...
scope=estate+locale
```

This is particularly valuable for administrative tooling.

---

# 64. Editorial Preview of Resolution

Editors SHOULD eventually be able to inspect why content resolves for a particular context.

The CMS SHOULD avoid requiring editors to understand raw database predicates.

---

# 65. Collision Detection

The system SHALL detect multiple equally specific eligible representations where only one is allowed.

Such a case SHALL be treated as an integrity error.

---

# 66. No Arbitrary Tie-Breaking

Where two records have equal specificity and validity, the resolver SHALL NOT choose:

- newest;
- oldest;
- lowest ID;
- first database result.

The ambiguity SHALL be corrected.

---

# 67. Unique Constraints

Persistence SHOULD enforce uniqueness for exclusive-resolution content where technically possible.

Conceptually:

```text id="avuskr"
UNIQUE (
  tenant,
  legal_entity,
  digital_estate,
  market,
  locale,
  content_key,
  active_validity
)
```

Exact implementation SHALL follow Payload and persistence capabilities.

---

# 68. Content Composition

Where `COMPOSE` is configured, the resolver SHALL define:

- source order;
- deduplication;
- merge key;
- conflict handling;
- removal semantics;
- override semantics.

Composition SHALL not mean simple array concatenation unless explicitly correct for the content type.

---

# 69. Removal Semantics

A narrower scope MAY need to explicitly suppress inherited content.

Therefore the content model SHOULD support deliberate removal or exclusion semantics where composition is used.

Otherwise inherited items may become impossible to remove.

---

# 70. Example: Navigation Composition

Conceptually:

```text id="4dpwkv"
Tenant:
  Home
  About
  Contact

Estate:
  Shop

Market:
  Wholesale
```

may resolve to:

```text id="8urlnz"
Home
About
Shop
Wholesale
Contact
```

only according to an explicit ordering policy.

---

# 71. Example: Navigation Suppression

An estate may intentionally hide a tenant-level navigation item.

This SHALL be represented explicitly rather than by deleting the parent item.

---

# 72. Cache Identity

Resolved content cache keys SHALL include all context dimensions that can affect resolution.

For example:

```text id="d61ikt"
tenant
estate
market
locale
content key/entity
effective policy version
```

as applicable.

---

# 73. Cache Invalidation

A change to a broader representation SHALL invalidate dependent inherited results.

For example:

```text id="0xq1y8"
Tenant footer changes
```

may invalidate caches for all estates inheriting that footer.

---

# 74. Narrow Override Invalidation

A change to one estate-specific override SHOULD invalidate only affected contexts where practical.

---

# 75. Policy Versioning

Resolution policies SHOULD be versionable.

A policy change may alter which content resolves even if no content record changes.

Such changes therefore require controlled deployment and cache invalidation.

---

# 76. Event Implications

Content events SHOULD include enough scope metadata to determine affected resolution contexts.

For example:

```text id="hb4t77"
content.updated
tenant
estate?
market?
locale?
canonical_entity
```

This enables downstream cache invalidation and reconciliation.

---

# 77. Inheritance Change Events

Where a broader record changes and downstream contexts inherit it, the platform MAY emit derived invalidation or resolution events.

It SHALL not duplicate physical content merely to propagate the change.

---

# 78. Digital Estate Independence

Digital estates SHALL consume resolved content through contracts.

They SHALL NOT independently recreate the canonical inheritance algorithm.

The resolver belongs to the Content Engine/platform boundary.

---

# 79. Frontend Override Logic

Frontend code SHALL NOT contain tenant-specific resolution such as:

```text id="9ly82q"
if market === "ZA":
   use content A
else:
   use content B
```

when that decision belongs to CMS content scope.

---

# 80. Search

Search results SHALL respect the same effective content scope.

A broader content representation shadowed by a narrower override SHOULD NOT appear as an equally valid duplicate unless the search use case explicitly requests all representations.

---

# 81. Sitemap Generation

Sitemap generation SHALL use resolved estate/market/locale content, not all raw Payload rows.

This prevents:

- duplicate URLs;
- unpublished overrides;
- wrong-locale pages;
- cross-market leakage.

---

# 82. SEO Canonical URLs

SEO canonical URLs SHALL remain presentation metadata.

They SHALL not affect canonical Baobab entity identity.

---

# 83. Redirects

Redirects SHALL participate in estate/market/locale scope where applicable.

A redirect defined for one digital estate SHALL not automatically affect another.

---

# 84. Effective URL Resolution

URL generation may depend on:

- estate;
- market;
- locale;
- route configuration.

This is downstream of content identity and scope resolution.

---

# 85. Multi-Region Deployment

Regional Payload instances SHALL apply the same canonical resolution policy.

A user routed to another region SHALL not receive different content merely because of local implementation differences.

---

# 86. Replicated Content

Where content is replicated between regional Payload instances, canonical identity and applicability SHALL remain consistent.

Physical replication SHALL not create independent content semantics.

---

# 87. Data Residency

Residency policy may determine which EngineInstance serves a request.

It SHALL not redefine market or locale inheritance semantics.

---

# 88. Offline or Degraded Operation

If policy allows operation during Control Plane unavailability, the Content Engine MAY use validated local projections of:

- estates;
- markets;
- locales;
- capabilities;
- policies.

Such projections SHALL be versioned and reconcilable.

---

# 89. Policy Staleness

If the resolver cannot establish that its required policy projection is sufficiently current, sensitive resolution SHOULD fail closed rather than invent behaviour.

---

# 90. Administrative Configuration

Resolution policies SHALL be governed configuration.

Ordinary editors SHALL not casually alter core precedence rules unless granted explicit platform authority.

---

# 91. Tenant-Specific Configuration

Tenants MAY configure allowed values such as:

- default locale;
- supported locales;
- estate defaults;
- market availability;
- content fallback rules within permitted policy bounds.

They SHALL not redefine core platform isolation semantics.

---

# 92. Schema Governance

New content types SHALL declare:

1. supported scope dimensions;
2. inheritance mode;
3. fallback rules;
4. uniqueness requirements;
5. localisation behaviour;
6. composition semantics;
7. temporal applicability;
8. publication eligibility.

A content type SHALL not enter production without this declaration.

---

# 93. Reconciliation

Reconciliation SHALL detect:

- duplicate equally specific records;
- invalid estate references;
- invalid market references;
- unsupported locales;
- cross-tenant scope;
- impossible fallback relationships;
- circular locale fallback;
- orphan overrides;
- expired active content;
- policy/version mismatch.

---

# 94. Migration

Legacy content without explicit scope SHALL undergo classification before joining the resolver.

Migration SHALL determine whether content is:

- platform;
- tenant;
- legal-entity;
- estate;
- market;
- locale scoped.

Ambiguous records SHALL not be silently assigned arbitrary defaults.

---

# 95. Rejected Alternative: One Record Per Tenant Only

Rejected because Baobab requires estate, market and locale variation.

---

# 96. Rejected Alternative: Duplicate Full Content Per Market

Rejected as the default model.

Some content genuinely requires market-specific representation, but indiscriminate duplication increases editorial drift.

Inheritance SHOULD be used where semantics permit.

---

# 97. Rejected Alternative: Locale as the Only Variant Dimension

Rejected.

Markets, legal entities and digital estates represent independent concerns.

---

# 98. Rejected Alternative: Country-Based Resolution

Rejected.

Market is richer than country and does not necessarily map one-to-one to geography.

---

# 99. Rejected Alternative: Frontend Resolution

Rejected because every digital estate would otherwise reimplement business policy.

---

# 100. Rejected Alternative: Database Order Resolution

Rejected because physical retrieval order is not an architectural rule.

---

# 101. Rejected Alternative: Latest Record Wins

Rejected.

A more recent broad record must not silently override a valid specific record.

---

# 102. Rejected Alternative: Implicit Locale Fallback

Rejected.

Language similarity is not sufficient governance.

---

# 103. Rejected Alternative: Null Means Inherited

Rejected.

Inheritance SHALL be represented deliberately through policy and scope.

---

# 104. Consequences

## 104.1 Positive

The decision provides:

- deterministic content delivery;
- predictable localisation;
- market-specific behaviour;
- estate independence;
- reusable tenant-level content;
- reduced duplication;
- explainable fallback;
- safer regulatory content;
- better caching;
- consistent behaviour across digital estates.

## 104.2 Negative

The architecture adds:

- policy complexity;
- resolver implementation;
- more metadata;
- validation requirements;
- more sophisticated cache invalidation;
- migration work;
- editorial training.

These costs are accepted because content inheritance becomes complex regardless of whether the complexity is modelled explicitly.

---

# 105. Architectural Invariants

The following are normative.

1. Tenant isolation precedes content inheritance.
2. Cross-tenant inheritance is prohibited.
3. Digital estate is distinct from tenant.
4. Market is distinct from tenant.
5. Locale is distinct from market.
6. Region is distinct from market.
7. Domain is distinct from digital estate.
8. Inheritance is content-type specific.
9. Fallback is explicit.
10. Fallback is deterministic.
11. Missing content does not justify cross-tenant lookup.
12. Locale fallback is configured.
13. Market fallback is configured.
14. Publication state affects eligibility, not identity.
15. Temporal validity affects eligibility.
16. Equally specific duplicates are errors.
17. Resolver does not use arbitrary tie-breaking.
18. Global scope is explicit.
19. Null scope is not implicit global scope.
20. Digital estates do not reimplement canonical resolution.
21. Frontends do not contain ordinary tenant-specific content-selection logic.
22. Cache keys include resolution context.
23. Broader content changes invalidate inherited results.
24. New content types declare resolution semantics.
25. Resolution policies are governed and versionable.
26. Migration must classify legacy scope.
27. Resolution behaviour is explainable.

---

# 106. Required Conformance Tests

## CT-001 — Exact Scope Wins

An exact estate/market/locale match resolves before broader eligible content.

## CT-002 — Tenant Fallback

Broader tenant content is used only where policy permits inheritance.

## CT-003 — Estate Override

Estate-specific content overrides broader tenant content when configured.

## CT-004 — Market Override

Market-specific content overrides broader eligible content where permitted.

## CT-005 — Locale Override

Locale-specific content resolves correctly.

## CT-006 — Explicit Locale Fallback

Configured locale fallback works deterministically.

## CT-007 — No Cross-Tenant Fallback

Missing Tenant A content never resolves Tenant B content.

## CT-008 — Strict Content Failure

Content configured with `NONE` inheritance fails when exact representation is absent.

## CT-009 — Composition

`COMPOSE` content produces deterministic merged output.

## CT-010 — Duplicate Specificity

Two equally specific exclusive records produce an integrity error.

## CT-011 — Temporal Eligibility

Expired or future content does not resolve outside its validity period.

## CT-012 — Draft Exclusion

Draft content is excluded from public resolution.

## CT-013 — Preview Resolution

Preview uses the same scope rules while allowing draft eligibility.

## CT-014 — Invalid Context

Tenant/estate/market incompatibility fails.

## CT-015 — Cache Isolation

Resolved content cache cannot leak across estate/market/locale contexts.

## CT-016 — Policy Version

Changing resolver policy invalidates or bypasses stale cache entries.

## CT-017 — Reconciliation

Invalid fallback and scope relationships are detectable.

---

# 107. Implementation Direction

The Content Engine SHOULD implement a reusable resolution subsystem.

Conceptually:

```text id="o6u342"
src/
└── baobab/
    ├── context/
    ├── content-resolution/
    │   ├── resolver.ts
    │   ├── policies.ts
    │   ├── specificity.ts
    │   ├── inheritance.ts
    │   ├── fallback.ts
    │   ├── composition.ts
    │   ├── validation.ts
    │   └── trace.ts
    │
    ├── estates/
    ├── markets/
    ├── localisation/
    └── caching/
```

Exact implementation is non-normative.

The central resolver boundary is normative.

---

# 108. Canonical Resolution Model

The final conceptual model is:

```text id="xdynnr"
                    REQUEST CONTEXT
                          │
                          ▼
                     Tenant
                          │
                          ▼
                    Legal Entity
                          │
                          ▼
                  Digital Estate
                          │
                          ▼
                       Market
                          │
                          ▼
                       Locale
                          │
                          ▼
                Resolution Policy
                          │
           ┌──────────────┼──────────────┐
           │              │              │
           ▼              ▼              ▼
      Exact Match      Fallback       Composition
           │              │              │
           └──────────────┼──────────────┘
                          ▼
                  Resolved Content
```

The guiding rule is:

> **Content inheritance narrows context; it never weakens ownership, isolation or authority.**

Baobab therefore resolves content by canonical context and governed policy, not by accident of storage, timestamp, hostname or database retrieval order.