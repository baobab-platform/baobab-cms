# ADR-0016: Payload Media, Asset Storage and Delivery Architecture

**Status:** Accepted  
**Date:** 2026-09-04  
**Decision Class:** Platform Architecture / Content Management / Media  
**Scope:** Baobab Content Engine  
**Repository:** `baobab-platform/baobab-cms`  
**Parent ADRs:**  
- `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`
- `ADR-0012-payload-multi-tenancy-and-content-isolation-architecture.md`
- `ADR-0013-payload-canonical-content-identity-and-external-mapping.md`
- `ADR-0014-payload-digital-estate-market-locale-and-content-inheritance.md`

**Related Engines:** Baobab Control Plane, Baobab Trade Engine, digital estates  
**Supersedes:** None  
**Architectural Style:** Object-storage-backed, identity-separated, context-aware, policy-driven media delivery

---

# 1. Context

Payload CMS will manage a significant class of digital assets used by Baobab digital estates.

These include:

- images;
- documents;
- downloadable files;
- campaign assets;
- product imagery;
- editorial graphics;
- brand assets;
- videos or video references;
- legal documents;
- content attachments.

Media introduces concerns that are materially different from ordinary structured content.

These concerns include:

- large binary objects;
- object storage;
- CDN delivery;
- access control;
- URL signing;
- tenant isolation;
- digital-estate scoping;
- market applicability;
- transformations;
- derivatives;
- caching;
- lifecycle;
- malware scanning;
- retention;
- data residency;
- backup;
- regional delivery.

The architecture must therefore distinguish the **media entity**, its **metadata**, its **physical object**, and its **delivery representation**.

---

# 2. Problem Statement

A simplistic CMS media architecture often treats:

```text
database record
=
file
=
URL
=
identity
```

This creates coupling between editorial identity and infrastructure.

For example:

```text
https://cms.example.com/media/uploads/logo.png
```

must not become the permanent identity of a Baobab media asset.

Domains can change.

Storage providers can change.

Objects can move between regions.

Files can be transformed.

CDNs can change.

Payload itself may eventually be replaced.

Baobab therefore requires explicit separation between:

1. canonical media identity;
2. Payload media record;
3. binary object identity;
4. delivery URL;
5. derived rendition.

---

# 3. Decision

Baobab SHALL implement media as a **structured editorial resource backed by external object storage**.

Payload SHALL own editorial metadata and the CMS representation.

Durable production binaries SHALL reside in an approved object-storage service.

The canonical architecture SHALL be:

```text
Canonical MediaAsset
        │
        ▼
Payload Media Record
        │
        ▼
Storage Reference
        │
        ▼
Object Storage
        │
        ▼
Delivery / CDN / Signed URL
```

These layers SHALL remain distinguishable.

---

# 4. Payload Media Authority

Payload SHALL be authoritative for editorial metadata associated with media, including where applicable:

- title;
- caption;
- description;
- alt text;
- attribution;
- editorial classification;
- tenant;
- digital-estate scope;
- market applicability;
- locale applicability;
- publication state;
- rights metadata;
- content relationships;
- derivative metadata.

---

# 5. Object Storage Authority

The object-storage system SHALL be authoritative for the durable binary object.

Payload SHALL store references necessary to locate and govern that object.

The storage key SHALL not become canonical business identity.

---

# 6. Canonical Media Identity

Media assets requiring long-lived platform identity SHOULD participate in the canonical mapping model.

Conceptually:

```text
CanonicalEntity
type = MEDIA_ASSET
```

with an external reference to the Payload media record.

The physical object may additionally have storage identifiers, but those SHALL not replace canonical identity.

---

# 7. When Canonicalisation Is Required

A media record SHOULD receive canonical identity where it:

- is referenced across engines;
- is reused across digital estates;
- participates in canonical events;
- requires migration between Payload instances;
- requires long-term platform references;
- may move between storage systems;
- needs platform-level reconciliation.

Purely temporary or internal media MAY remain Payload-local.

---

# 8. Storage Key Is Not Canonical Identity

The following SHALL NOT become canonical media identity:

- object key;
- filename;
- URL;
- CDN path;
- bucket name;
- Payload media ID.

These values may change independently of the semantic media asset.

---

# 9. File Name Is Not Identity

Files named:

```text
logo.png
```

may legitimately exist for many tenants and digital estates.

Filename uniqueness SHALL never be treated as a global identity invariant.

---

# 10. Durable Production Storage

Production media SHALL NOT rely on an ephemeral container filesystem.

Payload containers SHALL be considered disposable runtime instances.

Persistent binaries SHALL be stored externally.

---

# 11. Local Development

Local development MAY use:

- filesystem storage;
- local S3-compatible storage;
- MinIO;
- equivalent developer-oriented adapters.

Development convenience SHALL not alter production durability requirements.

---

# 12. Storage Abstraction

Payload SHALL access media storage through supported storage adapters or an equivalent bounded integration layer.

Application code SHOULD avoid direct dependency on provider-specific object-storage APIs unless explicitly required.

---

# 13. Object Storage Provider

The architecture SHALL remain provider-neutral at the content-domain layer.

Deployment MAY use:

- S3-compatible object storage;
- cloud-native object storage;
- private object storage;
- regional storage services.

Provider selection is an infrastructure concern.

---

# 14. Tenant Isolation

Media SHALL obey ADR-0012 tenant-isolation rules.

Tenant A SHALL NOT access Tenant B private media merely because the underlying object-store path is discoverable.

---

# 15. Logical Storage Partitioning

Shared object storage SHOULD logically partition tenant data.

Conceptually:

```text
media/
├── tenant-a/
├── tenant-b/
└── tenant-c/
```

or an equivalent opaque structure.

This is defence in depth.

The object path SHALL not be the sole security control.

---

# 16. Dedicated Storage

An `IsolationProfile` MAY require:

- dedicated bucket;
- dedicated storage account;
- dedicated encryption keys;
- dedicated region;
- dedicated network boundary.

Media architecture SHALL support stronger physical isolation without changing canonical media identity.

---

# 17. Digital Estate Scope

Media MAY be scoped to:

- tenant;
- legal entity;
- digital estate;
- market;
- locale.

Scope SHALL be explicit.

A digital estate SHALL not automatically gain access to all media belonging to the same tenant.

---

# 18. Shared Media

Media intended for reuse across multiple digital estates SHOULD be modelled at the appropriate broader authorised scope.

Duplication of the physical object SHOULD not be required merely because multiple estates reference it.

---

# 19. Cross-Tenant Sharing

Cross-tenant sharing SHALL be prohibited by default.

Where genuinely required, it SHALL use an explicit governed shared-resource model.

---

# 20. Public Versus Private Media

Media classification SHALL distinguish at minimum:

```text
PUBLIC
RESTRICTED
PRIVATE
```

or equivalent canonical policy states.

Classification SHALL be independent of whether the object currently has a publicly reachable URL.

---

# 21. Public Media

Public media MAY be delivered through:

- CDN;
- public object endpoint;
- edge cache;
- image transformation service.

Public classification SHALL still preserve tenant ownership and auditability.

---

# 22. Private Media

Private media SHALL require authorised delivery.

Possible mechanisms include:

- authenticated proxying;
- signed URLs;
- signed cookies;
- restricted CDN access;
- equivalent controlled delivery.

---

# 23. Signed URLs

Signed URLs SHOULD be:

- time-limited;
- resource-specific;
- generated only after authorisation;
- scoped to the relevant object.

A signed URL is a delivery credential, not identity.

---

# 24. URL Leakage

The architecture SHALL assume that URLs may leak through:

- browser history;
- logs;
- referrers;
- screenshots;
- analytics.

Private media controls SHALL therefore not depend on obscurity.

---

# 25. CDN

A CDN MAY be used for public and appropriately controlled media delivery.

The CDN SHALL be treated as a delivery/cache layer, not authoritative storage.

---

# 26. CDN Origin

The authoritative origin SHOULD remain object storage or an approved media-delivery service.

CDN cache loss SHALL not imply media loss.

---

# 27. Cache Keys

CDN and application cache keys SHALL account for all dimensions affecting media eligibility or transformation.

Examples may include:

- canonical media identity;
- rendition;
- access class;
- tenant where required;
- transformation parameters.

---

# 28. Private Cache Safety

Private or tenant-restricted media SHALL NOT be stored in a globally shared public cache without appropriate controls.

---

# 29. Image Transformations

The platform MAY support transformations such as:

- resizing;
- cropping;
- format conversion;
- quality optimisation;
- thumbnails;
- responsive variants.

Transformations SHALL create derived representations, not new semantic assets by default.

---

# 30. Original Asset

The original uploaded media SHOULD remain logically distinguishable from derived renditions.

Conceptually:

```text
Canonical MediaAsset
       │
       ├── Original
       ├── Thumbnail
       ├── WebP rendition
       └── Mobile rendition
```

---

# 31. Rendition Identity

A rendition MAY have its own technical identifier.

It SHALL not automatically receive independent canonical entity identity.

---

# 32. Rendition Determinism

Where practical, derivative generation SHOULD be deterministic from:

```text
source object
+
transformation specification
```

This simplifies regeneration and disaster recovery.

---

# 33. Source Preservation

Lossy derivatives SHALL not replace the original source unless policy explicitly allows destructive optimisation.

---

# 34. Format Strategy

The delivery layer MAY negotiate efficient formats.

Editorial records SHOULD remain independent of a particular derivative format.

---

# 35. Product Media

Product imagery may be commerce-operational or editorial.

ADR-0015 establishes that authority depends on semantic purpose.

Payload SHOULD own rich editorial media.

Medusa MAY retain commerce-operational media where required.

Canonical mappings MAY relate both to the same conceptual product.

---

# 36. Duplicate Product Media

Baobab SHOULD avoid unnecessary binary duplication between Medusa and Payload.

Where integration permits, one governed media asset MAY be referenced from both contexts.

However, the architecture SHALL not force engines into shared persistence.

---

# 37. Cross-Engine Media Reference

Cross-engine media relationships SHOULD use canonical media identity or stable approved API references.

Engines SHALL not reach into each other's storage tables.

---

# 38. Media Upload

Uploads SHALL enter through a controlled path.

The system SHOULD validate:

- authenticated actor;
- tenant context;
- file size;
- type;
- extension;
- MIME type;
- policy;
- storage quota where applicable.

---

# 39. Content-Type Validation

The platform SHALL not trust filename extensions alone.

Content type SHOULD be validated using appropriate metadata and inspection techniques.

---

# 40. Malware Scanning

Uploaded files that can carry malicious content SHOULD pass through a malware-scanning or equivalent security process before public or privileged distribution.

The exact scanner is implementation-specific.

---

# 41. Quarantine

Suspicious or unverified uploads SHOULD support quarantine.

Quarantined media SHALL not become publicly deliverable.

---

# 42. Upload Lifecycle

A media upload MAY transition conceptually through:

```text
UPLOADING
    ↓
SCANNING
    ↓
READY
    ↓
PUBLISHED
```

or:

```text
SCANNING
    ↓
QUARANTINED
```

Exact states may differ.

---

# 43. Publication State

The media record's editorial publication state SHALL remain distinct from physical object existence.

An object may exist in storage while its media record remains unpublished.

---

# 44. Object Existence Does Not Grant Delivery

A successfully stored binary SHALL not automatically become publicly accessible.

---

# 45. Metadata Validation

Required metadata MAY vary by media type.

For example, editorial images SHOULD support accessibility metadata such as alt text where applicable.

The architecture SHOULD enable policy-based validation before publication.

---

# 46. Accessibility

Digital estates SHOULD consume editorial accessibility metadata from Payload.

Missing accessibility metadata SHOULD be detectable through validation or content quality checks.

---

# 47. Rights and Attribution

Media MAY include:

- copyright holder;
- licence;
- attribution;
- usage restrictions;
- expiry;
- source.

Such metadata SHALL remain attached to the media entity, not embedded solely in filenames or external spreadsheets.

---

# 48. Rights Expiry

Where media rights expire, the system SHOULD support automatic or assisted prevention of continued publication.

---

# 49. Temporal Applicability

Media MAY be eligible only during configured periods.

This SHALL integrate with ADR-0014 content applicability rules.

---

# 50. Versioning

Replacing a binary MAY either:

- create a new version of the same semantic asset; or
- create a new media asset.

This depends on lifecycle semantics.

---

# 51. Non-Breaking Binary Replacement

A corrected or optimised file MAY retain canonical media identity where it is considered the same semantic asset.

---

# 52. Material Replacement

If the new file represents a materially different asset with independent provenance or rights, it SHOULD receive a new canonical identity.

---

# 53. Version History

Where required, media history SHOULD preserve:

- prior object reference;
- change time;
- actor;
- reason;
- checksum;
- publication state.

---

# 54. Checksums

The platform SHOULD maintain cryptographic checksums for durable objects where operationally useful.

Checksums support:

- integrity verification;
- deduplication analysis;
- migration verification;
- corruption detection.

---

# 55. Checksum Is Not Identity

Content hash SHALL not automatically become canonical identity.

Two tenants may upload identical binaries with different ownership and lifecycle.

---

# 56. Deduplication

Physical deduplication MAY be implemented at the storage layer.

It SHALL not collapse separate logical ownership records merely because file contents are identical.

---

# 57. Storage Encryption

Production media SHOULD be encrypted at rest using provider-appropriate mechanisms.

Stronger `IsolationProfile` policies MAY require tenant-specific encryption keys.

---

# 58. Encryption in Transit

Media upload and delivery SHALL use encrypted transport across untrusted networks.

---

# 59. Key Management

Encryption-key ownership and rotation belong to infrastructure/security governance.

Payload SHALL not embed long-lived object-storage secrets in content records.

---

# 60. Credentials

Runtime access to object storage SHALL use least-privilege service credentials.

Static credentials SHOULD be avoided where workload identity or equivalent mechanisms are available.

---

# 61. Object Ownership

Objects uploaded by the Content Engine SHALL have clearly governed ownership and access policy.

User-controlled object ACLs SHALL not bypass Baobab policy.

---

# 62. Presigned Uploads

Direct-to-object-storage upload MAY be supported.

If used:

- upload authorisation SHALL occur first;
- object key SHALL be server-governed;
- scope SHALL be constrained;
- finalisation SHALL validate the object.

---

# 63. Direct Upload Does Not Bypass CMS

A direct object-storage upload SHALL not become an authoritative media resource until the CMS/media workflow records and validates it.

---

# 64. Large Files

Large media SHOULD use multipart/resumable mechanisms where necessary.

The architecture SHALL not require large binaries to pass through application memory unnecessarily.

---

# 65. Streaming

Download and delivery SHOULD support streaming where appropriate.

---

# 66. Video

Large video media MAY be delegated to a specialised media/video platform.

Payload may retain metadata and canonical references.

The Content Engine SHALL not be forced to become a video-transcoding platform.

---

# 67. External Media

Payload MAY reference externally hosted media.

Such references SHALL still carry:

- ownership context;
- rights;
- scope;
- provenance;
- lifecycle.

External URL availability SHALL be considered operationally weaker than Baobab-controlled durable storage.

---

# 68. Broken External Media

Externally hosted assets SHOULD be monitorable or reconcilable for broken references.

---

# 69. Documents

Documents may require different delivery controls from public images.

For example:

- public brochure;
- tenant-only report;
- customer-specific document.

Content type SHALL not determine access class by itself.

---

# 70. Sensitive Documents

Sensitive or customer-specific transactional documents SHOULD ordinarily remain in the appropriate authoritative system rather than be imported into Payload solely for convenience.

Payload SHALL not become a generic secure document vault without a dedicated decision.

---

# 71. Search

Search indexes MAY store media metadata.

They SHALL not contain unrestricted binary content or expose restricted asset metadata contrary to access policy.

---

# 72. Search Isolation

Media search SHALL respect tenant and content-scope isolation.

---

# 73. Delivery API

Media delivery metadata SHOULD expose stable identifiers and delivery representations separately.

Conceptually:

```text
MediaResponse
-------------
canonical_media_id
media_type
metadata
renditions[]
delivery_url
expires_at?
```

The delivery URL MAY change between requests.

---

# 74. API Consumers

Digital estates SHALL not persist temporary signed URLs as durable references.

They SHOULD persist canonical or approved stable media identifiers.

---

# 75. URL Generation

Delivery URLs SHOULD be generated at runtime or through a cacheable resolution mechanism.

---

# 76. Domain Migration

Changing CDN or domain SHALL not require changing canonical media references in content.

---

# 77. Storage Migration

Moving from one object-storage provider to another SHALL preserve:

- canonical media identity;
- Payload relationships;
- editorial metadata.

Only physical storage references should materially change.

---

# 78. Regionalisation

Media storage MAY be regionalised.

The Control Plane and infrastructure layer MAY bind contexts to storage locations according to residency and performance policies.

---

# 79. Region Is Not Market

The platform SHALL not infer storage region solely from market.

Market and physical residency remain separate concerns.

---

# 80. Data Residency

Where residency policy requires assets to remain within a jurisdiction or region, the applicable isolation/deployment profile SHALL enforce this.

---

# 81. Cross-Region Replication

Replication MAY be:

- prohibited;
- asynchronous;
- selective;
- allowed only for public assets;

depending on policy.

The CMS SHALL not assume universal replication rights.

---

# 82. Replicated Object Identity

Replicas SHALL not create new canonical media identity.

They are physical copies of the same logical asset.

---

# 83. Failure: Object Store Unavailable

Payload SHOULD degrade predictably when object storage is unavailable.

Metadata operations unrelated to media delivery MAY remain available where safe.

Uploads SHALL fail explicitly rather than pretending success.

---

# 84. Failure: CDN Unavailable

Where CDN is unavailable, policy MAY permit fallback to origin delivery.

Private-content controls SHALL remain intact.

---

# 85. Failure: Transformation Service Unavailable

Original media MAY be served where policy and format permit.

The system SHALL not corrupt editorial references because derivatives are temporarily unavailable.

---

# 86. Orphaned Object

An object existing in storage with no valid Payload record SHALL be detectable.

---

# 87. Missing Object

A Payload media record whose physical object is missing SHALL be detectable.

---

# 88. Reconciliation

Media reconciliation SHALL detect at minimum:

- missing objects;
- orphan objects;
- checksum mismatch;
- invalid tenant ownership;
- invalid storage location;
- invalid canonical mapping;
- broken derivative references;
- expired rights still published;
- quarantined assets incorrectly exposed.

---

# 89. Garbage Collection

Physical object deletion SHALL occur only after lifecycle and reference checks.

A record deletion SHALL not automatically trigger immediate irreversible object deletion.

---

# 90. Retention

Retention policy MAY require deleted media to remain recoverable for a defined period.

---

# 91. Hard Delete

Hard deletion SHALL require:

- authorisation;
- reference validation;
- retention-policy compliance;
- audit.

---

# 92. Backup

Media backup SHALL account for both:

- Payload metadata;
- object-storage binaries.

Backing up only one is insufficient for complete recovery.

---

# 93. Backup Consistency

Recovery procedures SHALL define how metadata and objects are reconciled when captured at different times.

---

# 94. Restore

Restore SHALL preserve canonical identity and relationships.

Restored physical storage keys MAY differ if mapping is updated accordingly.

---

# 95. Tenant-Specific Recovery

The architecture SHOULD support recovery or extraction of one tenant's media without indiscriminately exposing unrelated tenant data.

---

# 96. Disaster Recovery

Disaster-recovery design SHALL consider:

- object durability;
- region loss;
- metadata restoration;
- key recovery;
- CDN reconfiguration;
- canonical mapping reconciliation.

The broader operational policy is finalised in ADR-0020.

---

# 97. Audit

Media operations SHOULD record:

- actor/system principal;
- tenant;
- media identity;
- action;
- upload;
- replacement;
- publication;
- access-policy change;
- deletion;
- quarantine;
- timestamp;
- correlation ID.

---

# 98. Access Logging

Sensitive media access MAY require dedicated access logging according to policy.

---

# 99. Observability

Operational telemetry SHOULD include:

- upload failures;
- storage latency;
- transformation failures;
- missing assets;
- CDN errors;
- storage consumption;
- quarantine counts;
- reconciliation failures.

---

# 100. Storage Quotas

Tenant storage quotas MAY be introduced.

Quotas SHALL be configurable and measurable.

They SHALL not be hard-coded into Payload schemas.

---

# 101. Cost Attribution

Where required, storage and delivery consumption SHOULD be attributable to:

- tenant;
- estate;
- region;
- service.

This supports future internal or commercial chargeback.

---

# 102. Media Lifecycle Events

Canonical media events MAY include:

```text
media.created
media.updated
media.published
media.unpublished
media.replaced
media.quarantined
media.retired
```

Exact naming SHALL follow shared canonical event contracts.

---

# 103. Event Payload

Media events SHOULD include:

- canonical media ID;
- tenant/context;
- source engine;
- source instance;
- relevant lifecycle state;
- correlation;
- causation.

They SHALL not unnecessarily include large binary payloads.

---

# 104. No Binary Events

Large media binaries SHALL NOT be embedded directly in normal canonical event envelopes.

Events SHOULD reference governed media resources.

---

# 105. Cache Invalidation Events

Media change events MAY drive:

- CDN invalidation;
- application cache invalidation;
- search reindexing;
- digital-estate refresh.

---

# 106. Contract Versioning

Media metadata contracts SHALL be versioned in `baobab-platform/shared` where they cross repository boundaries.

Provider-specific object-storage configuration SHALL not leak into organisation-wide content contracts unless required.

---

# 107. Rejected Alternative: Local Container Storage

Rejected for production because containers are disposable and independently scalable.

---

# 108. Rejected Alternative: Database Binary Storage by Default

Rejected as the general media architecture.

Large binary persistence should not unnecessarily burden the CMS transactional database.

---

# 109. Rejected Alternative: Public Bucket for Everything

Rejected because media access classes differ.

---

# 110. Rejected Alternative: URL as Media Identity

Rejected because delivery topology changes.

---

# 111. Rejected Alternative: Filename as Identity

Rejected because filenames are neither globally unique nor immutable.

---

# 112. Rejected Alternative: One Bucket per Tenant as Universal Rule

Rejected as a mandatory topology.

Dedicated buckets remain available through isolation policy where justified.

---

# 113. Rejected Alternative: Payload as Video Processing Platform

Rejected unless a future requirement and ADR justify it.

Specialised media services may handle heavy video processing.

---

# 114. Rejected Alternative: Shared Storage Tables Across Engines

Rejected.

Engines may share a storage service only through explicit contracts, not shared operational persistence.

---

# 115. Consequences

## 115.1 Positive

This decision provides:

- durable media;
- independent CMS scaling;
- tenant isolation;
- CDN compatibility;
- private-media controls;
- canonical identity stability;
- provider portability;
- regionalisation;
- better recovery;
- efficient binary delivery.

## 115.2 Negative

The architecture introduces:

- object-storage infrastructure;
- delivery-policy complexity;
- signed access flows;
- reconciliation;
- derivative management;
- malware scanning;
- additional backup coordination.

These costs are accepted.

---

# 116. Architectural Invariants

1. Payload owns editorial media metadata.
2. Object storage owns durable binary persistence.
3. Production media is not stored on ephemeral container filesystems.
4. Canonical media identity is distinct from Payload ID.
5. Canonical media identity is distinct from object key.
6. URL is not media identity.
7. Filename is not media identity.
8. Tenant isolation applies to media.
9. Object-path partitioning is defence in depth, not sole authorisation.
10. Public and private media are explicitly classified.
11. Private media requires controlled delivery.
12. Signed URLs are temporary credentials, not identities.
13. CDN is a delivery layer, not authoritative storage.
14. Originals and derivatives remain distinguishable.
15. Derivatives do not automatically become canonical entities.
16. Checksum is not canonical identity.
17. Physical deduplication does not collapse logical ownership.
18. Direct uploads do not bypass CMS validation.
19. Large binaries are not embedded in canonical events.
20. Storage migration preserves canonical identity.
21. Regional replication does not create new canonical identity.
22. Missing and orphaned objects are reconcilable.
23. Deletion respects retention and reference policy.
24. Metadata and binaries are both included in recovery design.
25. Cross-engine storage access occurs through contracts, not shared tables.
26. Media contracts remain provider-neutral where practical.

---

# 117. Required Conformance Tests

## CT-001 — Ephemeral Runtime

Restarting or replacing a Payload container does not lose production media.

## CT-002 — Tenant Isolation

Tenant A cannot access Tenant B restricted media.

## CT-003 — Private Delivery

Private media cannot be retrieved without valid authorisation.

## CT-004 — Signed URL Expiry

Expired signed URLs cease to authorise private access.

## CT-005 — Filename Collision

Two tenants can store files with identical original filenames without collision.

## CT-006 — Storage Migration

Moving a media object between approved storage backends preserves canonical media identity.

## CT-007 — CDN Independence

CDN cache loss does not destroy authoritative media.

## CT-008 — Derivative Regeneration

A deterministic rendition can be regenerated from the source asset and transformation policy.

## CT-009 — Missing Object Detection

A media record referencing a missing object is detected by reconciliation.

## CT-010 — Orphan Detection

Unreferenced storage objects are detectable.

## CT-011 — Quarantine

A quarantined upload cannot become publicly deliverable.

## CT-012 — Cross-Tenant Relationship

Tenant A content cannot reference restricted Tenant B media.

## CT-013 — No Binary Event

Canonical media events carry references rather than embedded binary payloads.

## CT-014 — Restore Identity

Backup restoration preserves canonical media identity and relationships.

## CT-015 — Domain Change

Changing media delivery domain does not require changing canonical content references.

---

# 118. Implementation Direction

A suitable implementation boundary MAY resemble:

```text
src/
└── baobab/
    ├── media/
    │   ├── collections/
    │   ├── metadata/
    │   ├── access/
    │   ├── delivery/
    │   ├── transforms/
    │   ├── quarantine/
    │   ├── reconciliation/
    │   └── lifecycle/
    │
    ├── storage/
    │   ├── adapter/
    │   ├── keys/
    │   ├── signing/
    │   └── policies/
    │
    ├── context/
    ├── identity/
    ├── events/
    └── audit/
```

The exact module layout is non-normative.

The separation between editorial metadata, canonical identity, physical storage and delivery is normative.

---

# 119. Decision Outcome

The Baobab Content Engine SHALL treat media as a durable, governed platform resource rather than as a file casually attached to a CMS record.

The governing model is:

```text
                    Canonical MediaAsset
                           │
                           ▼
                   Payload Media Record
                           │
                ┌──────────┴──────────┐
                │                     │
                ▼                     ▼
         Editorial Metadata      Storage Reference
                                      │
                                      ▼
                               Object Storage
                                      │
                         ┌────────────┴────────────┐
                         │                         │
                         ▼                         ▼
                   Original Asset             Derivatives
                         │                         │
                         └────────────┬────────────┘
                                      ▼
                               Delivery Layer
                                      │
                               CDN / Signed URL
                                      │
                                      ▼
                                Digital Estate
```

The architectural rule is:

> **Identity belongs to the platform, editorial meaning belongs to Payload, durable binaries belong to object storage, and delivery URLs are replaceable representations.**

That separation allows Baobab to change storage providers, CDN topology, regions, Payload instances and delivery mechanisms without redefining the media assets its digital estates depend upon.