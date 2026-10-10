# ADR-0019: Payload Content Schema Governance, Versioning and Migration

**Status:** Accepted  
**Date:** 2026-09-04  
**Decision Class:** Platform Architecture / Content Management / Schema Governance  
**Scope:** Baobab Content Engine  
**Repository:** `baobab-platform/baobab-cms`  
**Parent ADRs:**  
- `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`
- `ADR-0012-payload-multi-tenancy-and-content-isolation-architecture.md`
- `ADR-0013-payload-canonical-content-identity-and-external-mapping.md`
- `ADR-0014-payload-digital-estate-market-locale-and-content-inheritance.md`
- `ADR-0017-payload-identity-authentication-authorisation-and-editorial-administration.md`
- `ADR-0018-payload-canonical-events-webhooks-transactional-outbox-and-integration-reliability.md`

**Related Systems:** Baobab Control Plane, `baobab-platform/shared`, digital estates, MedusaJS Trade Engine  
**Supersedes:** None  
**Architectural Style:** Contract-governed, backward-compatible, migration-first, tenant-neutral schema evolution

---

# 1. Context

The Baobab Content Engine will evolve continuously.

Payload collections, globals, fields, relationships, indexes, access policies and editorial workflows will change over time.

This evolution is unavoidable.

Examples include:

- adding market-specific fields;
- introducing localisation;
- changing product-content relationships;
- extending media metadata;
- adding new digital-estate content types;
- renaming fields;
- splitting one collection into several;
- introducing new canonical mappings;
- changing publication workflows;
- evolving event contracts.

In a multi-tenant, independently deployable platform, schema changes are architectural changes when they affect:

- stored content;
- APIs;
- events;
- mappings;
- digital estates;
- migrations;
- tenancy;
- permissions;
- external consumers.

Baobab therefore requires formal schema governance.

---

# 2. Problem Statement

A naïve CMS development process may allow developers to edit collection definitions and deploy immediately.

For example:

```text id="r2u0az"
rename field
deploy
hope content still works
```

or:

```text id="jym32q"
delete collection
create new collection
manually copy records
```

This is unacceptable for Baobab.

Uncontrolled schema change may cause:

- data loss;
- incompatible APIs;
- broken digital estates;
- failed event consumers;
- invalid mappings;
- tenant-specific divergence;
- rollback impossibility;
- undeclared content semantics.

Schema evolution SHALL therefore be treated as a governed engineering process.

---

# 3. Decision

Baobab SHALL adopt **versioned, migration-driven, contract-aware content schema governance** for Payload CMS.

All production-significant schema changes SHALL be:

1. declared;
2. reviewed;
3. migration-aware;
4. tested;
5. contract-compatible;
6. reversible where practical;
7. tenant-neutral;
8. observable after deployment.

---

# 4. Schema Ownership

Payload schema definitions SHALL belong to:

```text id="3ei2jo"
baobab-platform/baobab-cms
```

The repository SHALL own:

- collections;
- globals;
- fields;
- relationships;
- indexes;
- validation;
- editorial lifecycle;
- access policies;
- local schema migrations.

---

# 5. Shared Contracts

Cross-repository contracts SHALL belong to:

```text id="cmaqvj"
baobab-platform/shared
```

Examples include:

- canonical identifiers;
- context schemas;
- event schemas;
- mapping schemas;
- API interoperability contracts.

Payload SHALL not redefine incompatible local versions of organisation-wide contracts.

---

# 6. Control Plane Contracts

Payload SHALL consume canonical definitions from the Control Plane where applicable for:

- tenant;
- legal entity;
- digital estate;
- market;
- engine;
- capability;
- context;
- isolation profile.

Payload schema changes SHALL not silently redefine those concepts.

---

# 7. Schema as Code

Production schema SHALL be defined as version-controlled code.

Manual production-only schema edits are prohibited.

---

# 8. No Tenant-Specific Forked Schema

Baobab SHALL prefer one governed schema model with scoped content over per-tenant schema forks.

Prohibited pattern:

```text id="nafm1n"
if tenant == "A":
    add field X

if tenant == "B":
    add field Y
```

unless a separately governed extension architecture explicitly permits it.

---

# 9. Schema Variability

Where tenants require different behaviour, Baobab SHOULD prefer:

- configuration;
- capability binding;
- optional fields;
- reusable blocks;
- policy;
- metadata;
- scoped content;

over code-level tenant forks.

---

# 10. Collection Governance

Every production collection SHALL have a defined purpose.

A collection SHOULD declare:

- authority;
- canonical identity requirement;
- tenancy scope;
- supported context dimensions;
- localisation behaviour;
- publication lifecycle;
- relationship semantics;
- retention expectations.

---

# 11. Global Governance

Payload globals SHALL not automatically mean Baobab platform-global content.

Their effective scope SHALL still comply with ADR-0012 and ADR-0014.

---

# 12. Field Governance

Fields SHALL have defined semantics.

A field SHALL not be added merely because it is convenient for one frontend.

Where possible, fields SHOULD model domain meaning rather than presentation implementation.

---

# 13. Presentation Leakage

Avoid schema such as:

```text id="jt4y82"
homepage_left_column_blue_text
```

Prefer semantic structures such as:

```text id="0dct1v"
hero
call_to_action
feature_list
```

---

# 14. Structured Content

Baobab SHALL favour structured, reusable content over arbitrary frontend blobs.

---

# 15. Flexible Blocks

Flexible content blocks MAY be used.

However, they SHALL remain governed by:

- schema version;
- validation;
- compatibility;
- access;
- migration rules.

---

# 16. Arbitrary JSON

Unbounded arbitrary JSON SHOULD be avoided where stable structured schema can express the domain.

Opaque JSON weakens:

- validation;
- migration;
- API contracts;
- searchability;
- interoperability.

---

# 17. Schema Versioning

The Content Engine SHALL maintain explicit schema/application version history.

Schema changes SHALL be traceable to source-control revisions and migrations.

---

# 18. Migration-First Principle

A schema change affecting persisted production data SHALL include a migration strategy before deployment.

---

# 19. Forward Migration

Forward migration SHALL transform existing state into the new supported schema.

---

# 20. Backward Compatibility

Where rolling or phased deployments are used, schema changes SHOULD remain compatible with the previous application version for the required deployment window.

---

# 21. Expand-and-Contract

Breaking changes SHOULD use an expand-and-contract strategy where practical.

Example:

```text id="m8kx2l"
Step 1:
add new field

Step 2:
write both old + new

Step 3:
migrate historical data

Step 4:
read new field

Step 5:
stop writing old field

Step 6:
remove old field later
```

---

# 22. Field Rename

Direct destructive rename SHOULD be avoided when rolling compatibility matters.

Prefer:

```text id="30nl1u"
add new field
copy values
dual compatibility
deprecate old
remove later
```

---

# 23. Field Deletion

A field SHALL not be removed until:

- consumers are migrated;
- data-retention implications are reviewed;
- migration is complete;
- rollback strategy is understood.

---

# 24. Collection Rename

Collection renames SHALL preserve canonical identity and mappings where semantic identity remains unchanged.

---

# 25. Collection Split

Splitting one collection into several SHALL explicitly define:

- canonical identity rules;
- mapping changes;
- relationship migration;
- event impact;
- API compatibility.

---

# 26. Collection Merge

Merging collections SHALL similarly define how distinct prior identities are handled.

Records SHALL not be silently collapsed.

---

# 27. Canonical Identity Preservation

Schema migration SHALL not create new canonical identity merely because storage representation changes.

---

# 28. Semantic Identity Change

If a migration genuinely changes the semantic meaning of an entity, new canonical identity MAY be required.

This SHALL be explicit.

---

# 29. External Reference Migration

Moving a record between Payload collections or engine instances MAY require new `ExternalReference` records while preserving canonical identity.

---

# 30. Temporal Mapping

Old external mappings SHOULD be retired or temporally closed rather than silently overwritten.

---

# 31. Relationship Migration

Relationship migrations SHALL preserve referential integrity.

---

# 32. Broken Relationship Prevention

A migration SHALL detect missing or invalid related records rather than silently dropping relationships.

---

# 33. Tenant Context Preservation

Every migrated tenant-owned record SHALL preserve correct tenant ownership.

---

# 34. Cross-Tenant Migration Safety

A migration SHALL never accidentally move content between tenants due to:

- missing filter;
- null tenant;
- incorrect join;
- wrong mapping.

---

# 35. Digital Estate Scope Preservation

Migration SHALL preserve digital-estate applicability unless intentionally changing it.

---

# 36. Market Scope Preservation

Market-specific records SHALL retain correct market semantics.

---

# 37. Locale Preservation

Localised content SHALL retain locale identity.

Locale migration SHALL not infer equivalence without explicit rules.

---

# 38. Publication State Preservation

Migration SHALL preserve valid publication state unless the migration explicitly changes lifecycle semantics.

---

# 39. Temporal State Preservation

Effective-from/effective-to semantics SHALL be preserved.

---

# 40. Version History Preservation

Where Payload content versions are retained, migrations SHOULD preserve meaningful history where technically practical.

---

# 41. Audit Preservation

Schema migrations SHALL not erase audit history unless retention policy explicitly allows it.

---

# 42. Migration Idempotency

Migrations SHOULD be idempotent or safely re-runnable where practical.

At minimum, they SHALL detect previously completed state.

---

# 43. Migration Atomicity

Small migrations MAY run transactionally.

Large migrations MAY require resumable phased execution.

The migration design SHALL match operational scale.

---

# 44. Large Data Migrations

Large migrations SHOULD avoid:

- long table locks;
- prolonged service outage;
- unbounded transactions;
- excessive memory consumption.

---

# 45. Online Migration

Where availability requirements justify it, migrations SHOULD support online or rolling execution.

---

# 46. Maintenance Window

Some breaking migrations MAY require a maintenance window.

This SHALL be explicit and planned rather than accidental.

---

# 47. Migration Checkpoints

Long-running migrations SHOULD record progress.

---

# 48. Migration Resume

A failed long-running migration SHOULD be resumable where practical.

---

# 49. Migration Observability

Operators SHOULD see:

- migration name;
- status;
- progress;
- start/end time;
- failure reason;
- affected records.

---

# 50. Pre-Migration Validation

Before destructive migration, the system SHOULD validate:

- database health;
- expected schema;
- content counts;
- mapping integrity;
- storage availability;
- backup readiness.

---

# 51. Post-Migration Validation

After migration, validation SHOULD include:

- content counts;
- tenant distribution;
- mapping integrity;
- broken relationships;
- publication state;
- API compatibility;
- event behaviour.

---

# 52. Backup Before Destructive Migration

Destructive or high-risk migrations SHALL require a verified recovery path.

---

# 53. Rollback

Rollback strategy SHALL be defined before deploying high-risk schema changes.

---

# 54. Code Rollback Versus Data Rollback

The architecture SHALL recognise that:

```text id="yvfcg8"
application rollback
```

and:

```text id="rr37lu"
data rollback
```

are not the same thing.

A previous binary may not understand newly migrated data.

---

# 55. Irreversible Migrations

If a migration is intentionally irreversible, this SHALL be explicitly documented.

---

# 56. Forward-Fix Strategy

Some production failures are safer to resolve through forward fixes than data rollback.

The migration plan SHALL state when this applies.

---

# 57. API Compatibility

Schema change SHALL consider public and internal APIs.

Removing or renaming API fields is a contract change.

---

# 58. API Versioning

Breaking Baobab-facing API changes SHALL follow versioning/deprecation policy.

---

# 59. GraphQL Compatibility

GraphQL schema evolution SHALL also be reviewed for downstream impact.

---

# 60. Digital Estate Compatibility

Digital estates SHALL not be surprised by undeclared content-schema changes.

---

# 61. Contract Tests

Critical digital estates SHOULD run compatibility tests against supported Content Engine contracts.

---

# 62. Event Compatibility

Schema changes affecting canonical events SHALL follow ADR-0018 versioning rules.

---

# 63. Event Field Deletion

Fields SHALL not be removed from event contracts merely because they are removed from Payload collections.

Canonical event evolution is separately governed.

---

# 64. Search Compatibility

Schema changes affecting indexed content SHALL include search migration/reindex strategy where relevant.

---

# 65. Cache Compatibility

Changes affecting resolution output SHOULD trigger appropriate cache invalidation.

---

# 66. Content Resolution Compatibility

Schema changes SHALL preserve or explicitly version ADR-0014 resolution semantics.

---

# 67. Inheritance Policy Change

Changing inheritance policy is a production-significant change even if no database column changes.

---

# 68. Policy Migration

Policy changes SHALL be treated as governed configuration migration.

---

# 69. Role and Permission Changes

Schema changes adding new protected resources SHALL include authorisation policy.

---

# 70. Access Defaults

New collections SHALL default to restrictive access until explicitly authorised.

---

# 71. Sensitive Fields

Adding sensitive fields SHALL trigger security/privacy review where appropriate.

---

# 72. Data Classification

Content fields SHOULD support classification where required by governance.

---

# 73. Data Minimisation

Schemas SHOULD avoid storing data unnecessary for Content Engine responsibility.

---

# 74. No ERP Shadow Tables

Payload schema SHALL not grow into a shadow ERP schema.

---

# 75. No Commerce Shadow Tables

Payload SHALL not recreate Medusa operational models merely for convenience.

---

# 76. Projection Collections

Non-authoritative projections MAY exist.

They SHALL be clearly identified as projections.

---

# 77. Projection Rebuildability

Where practical, projections SHOULD be rebuildable from authoritative sources.

---

# 78. Projection Migration

Projection migrations SHOULD favour rebuild over complicated in-place mutation where safe and economical.

---

# 79. Seed Data

Seed data SHALL be distinguished from tenant production content.

---

# 80. Platform Seed Data

Platform-level seed data MAY include:

- canonical content-type defaults;
- reference taxonomy;
- system configuration.

It SHALL not silently create tenant business content.

---

# 81. Tenant Bootstrap

Tenant bootstrap content SHALL be explicit and idempotent.

---

# 82. Sample Content

Development sample content SHALL not appear in production.

---

# 83. Fixture Governance

Test fixtures SHALL exercise:

- multiple tenants;
- multiple estates;
- multiple markets;
- multiple locales;
- identity mappings.

---

# 84. Migration Testing

Each migration SHALL be tested against representative prior-state fixtures.

---

# 85. Upgrade Testing

CI SHOULD test upgrade from supported prior schema versions where practical.

---

# 86. Downgrade Awareness

Where downgrade is unsupported, this SHALL be explicit.

---

# 87. Production Drift

The system SHALL detect or prevent production schema drift from repository-defined state.

---

# 88. Manual Database Changes

Manual production database modification SHALL be exceptional, auditable and reconciled back into code/migrations.

---

# 89. Schema Authority

Database schema SHALL not be treated as editable runtime configuration.

---

# 90. Migration Naming

Migrations SHALL use deterministic, sequential or otherwise unambiguous naming.

Naming convention SHALL be repository-standard.

---

# 91. Migration Immutability

Applied migrations SHALL not normally be rewritten.

Corrections SHOULD be introduced through new migrations.

---

# 92. Migration Ordering

Migration dependencies SHALL be explicit.

---

# 93. Parallel Development

Conflicting schema migrations from parallel branches SHALL be reconciled before production deployment.

---

# 94. Branch Compatibility

Long-lived branches SHOULD not independently evolve incompatible migration histories.

---

# 95. Release Association

Migrations SHOULD be associated with application releases.

---

# 96. Deployment Gate

Production deployment SHALL fail or stop when required migrations are missing or incompatible.

---

# 97. Migration Execution Authority

Production migrations SHALL run under controlled service/operator authority.

Ordinary CMS editors SHALL not execute database migrations.

---

# 98. Schema Administration UI

Payload Admin SHALL not expose uncontrolled production schema mutation to ordinary users.

---

# 99. Runtime Schema Plugins

Plugins that dynamically alter core production schema SHALL be governed and version-pinned.

---

# 100. Payload Upgrade

Payload framework upgrades SHALL include review of:

- database changes;
- migration semantics;
- plugin compatibility;
- API behaviour;
- Admin UI;
- auth/access behaviour;
- versioning behaviour.

---

# 101. Plugin Upgrade

Plugin upgrades SHALL be treated as supply-chain and schema-risk changes where applicable.

---

# 102. Upstream Compatibility

Baobab SHOULD prefer supported Payload extension points over deep internal patching.

---

# 103. Fork Avoidance

A permanent Payload fork SHALL require a separate ADR.

---

# 104. Dependency Pinning

Production dependencies SHOULD be version-controlled and reproducible.

---

# 105. Schema Documentation

Content types SHOULD have human-readable documentation describing:

- purpose;
- fields;
- scope;
- ownership;
- lifecycle;
- relationships;
- resolution behaviour.

---

# 106. Deprecation

Deprecated fields or collections SHOULD be marked and communicated before removal.

---

# 107. Deprecation Window

Breaking consumer-facing fields SHOULD have an appropriate migration/deprecation window.

---

# 108. Deprecated Data

Deprecation SHALL not automatically destroy historical data.

---

# 109. Data Archival

Old content MAY be archived rather than retained in active collections indefinitely.

---

# 110. Archival Schema

Archived data SHALL remain interpretable.

---

# 111. Exportability

Tenant content SHOULD remain exportable in a form that preserves:

- canonical identity;
- scope;
- locale;
- relationships;
- metadata.

---

# 112. Import Compatibility

Importers SHALL validate source schema version.

---

# 113. Unknown Schema Versions

Unsupported imported schema versions SHALL fail explicitly.

---

# 114. Transformation Registry

Complex import/export transformations SHOULD be versioned.

---

# 115. Schema Hash or Metadata

The system MAY expose schema/version metadata for diagnostics and compatibility checks.

---

# 116. Reconciliation

Schema reconciliation SHALL detect:

- missing expected fields;
- invalid relationships;
- orphan mappings;
- invalid scope values;
- obsolete enum values;
- unsupported legacy structures.

---

# 117. Data Quality

Migration is responsible not only for structural correctness but also for preserving business meaning.

---

# 118. Invalid Legacy Data

Invalid legacy data SHALL not be silently discarded.

It SHOULD be:

- corrected;
- quarantined;
- flagged;
- migrated with explicit exception handling.

---

# 119. Tenant-Specific Legacy Exceptions

Legacy exceptions SHALL be data-driven migration rules where unavoidable.

They SHALL not become permanent tenant-specific schema branches.

---

# 120. Security Review

Migration code SHALL be reviewed for tenant-boundary correctness.

---

# 121. Migration Audit

Significant production migrations SHOULD record:

- version;
- operator/service;
- start;
- completion;
- result;
- affected counts.

---

# 122. Observability

Operational metrics SHOULD expose:

- migration failures;
- pending migrations;
- duration;
- invalid record counts;
- reconciliation failures.

---

# 123. Rejected Alternative: Manual CMS Schema Editing in Production

Rejected because it creates uncontrolled drift.

---

# 124. Rejected Alternative: Tenant-Specific Collections by Default

Rejected because it creates long-term schema fragmentation.

---

# 125. Rejected Alternative: Arbitrary JSON for Everything

Rejected because it weakens validation and evolvability.

---

# 126. Rejected Alternative: Destructive Rename Without Migration

Rejected because consumers and historical data may break.

---

# 127. Rejected Alternative: Payload Schema as Shared Organisation Contract

Rejected.

Payload owns Content Engine implementation schema; cross-repository contracts belong in `baobab-platform/shared`.

---

# 128. Rejected Alternative: Rewriting Applied Migrations

Rejected because deployment histories become non-reproducible.

---

# 129. Rejected Alternative: Assume Code Rollback Restores Data

Rejected because schema/data changes may be irreversible.

---

# 130. Rejected Alternative: Event Schema Follows Payload Automatically

Rejected because canonical event contracts have independent governance.

---

# 131. Consequences

## 131.1 Positive

This decision provides:

- safer schema evolution;
- reproducible environments;
- tenant-neutral models;
- controlled breaking changes;
- stable digital-estate contracts;
- better recoverability;
- predictable migrations;
- protection against long-term schema fragmentation.

## 131.2 Negative

The architecture introduces:

- migration discipline;
- compatibility testing;
- deprecation processes;
- operational migration tooling;
- more deliberate schema reviews.

These costs are accepted.

---

# 132. Architectural Invariants

1. Production schema is defined as code.
2. Persisted schema changes require migration strategy.
3. Applied migrations are not casually rewritten.
4. Tenant-specific schema forks are prohibited by default.
5. Cross-repository contracts belong in `baobab-platform/shared`.
6. Canonical platform concepts are not redefined by Payload schema.
7. Canonical identity survives storage-schema changes where semantics remain unchanged.
8. Migrations preserve tenant ownership.
9. Migrations preserve estate, market and locale scope.
10. Relationships are not silently discarded.
11. Publication state is intentionally migrated.
12. Breaking API changes are versioned/deprecated.
13. Breaking event changes follow canonical event governance.
14. Large migrations are operationally bounded.
15. High-risk migrations have recovery strategy.
16. Application rollback and data rollback are distinct.
17. Production drift is prohibited or detected.
18. Ordinary editors do not control database schema.
19. Projection schemas are explicitly non-authoritative.
20. Sample content does not leak into production.
21. New content types declare scope and lifecycle semantics.
22. Schema evolution is tested against representative prior state.
23. Payload framework/plugin upgrades include schema impact review.
24. Destructive changes require explicit lifecycle handling.
25. Migration failures are observable.

---

# 133. Required Conformance Tests

## CT-001 — Tenant Preservation

Migration preserves tenant ownership for all migrated records.

## CT-002 — Cross-Tenant Safety

A migration cannot move Tenant A content into Tenant B scope.

## CT-003 — Canonical Identity Stability

Collection/field restructuring preserves canonical identity where semantic identity is unchanged.

## CT-004 — Relationship Integrity

Relationships remain valid after migration or failures are explicitly reported.

## CT-005 — Locale Preservation

Localised records retain correct locale after migration.

## CT-006 — Market Preservation

Market-scoped records retain correct market.

## CT-007 — Publication Preservation

Published/draft state migrates correctly.

## CT-008 — Idempotency

A migration designed for rerun does not duplicate or corrupt state.

## CT-009 — Compatibility

Supported prior digital-estate/API clients continue to work during the defined compatibility window.

## CT-010 — Event Compatibility

Schema migration does not silently break supported canonical event contracts.

## CT-011 — Drift Detection

Unapproved production schema changes are detectable.

## CT-012 — Failed Migration

Failure leaves the system in a known recoverable or resumable state.

## CT-013 — Upgrade Path

Representative supported prior schema can be upgraded successfully.

## CT-014 — Invalid Legacy Data

Invalid source data is surfaced rather than silently discarded.

## CT-015 — Access Policy

New protected collections are not accidentally public by default.

---

# 134. Implementation Direction

A suitable repository structure MAY resemble:

```text id="9ycrn7"
src/
└── collections/
└── globals/
└── blocks/
└── fields/
└── access/

migrations/
├── 000001-...
├── 000002-...
└── ...

src/baobab/
├── schema/
│   ├── governance/
│   ├── compatibility/
│   └── validation/
│
├── migrations/
│   ├── helpers/
│   ├── reconciliation/
│   └── checkpoints/
│
└── contracts/
```

Exact layout is non-normative.

---

# 135. Decision Outcome

Payload schema SHALL evolve as a governed production contract, not as an ad hoc CMS configuration.

The governing model is:

```text id="i8m4gf"
            Schema Change Proposal
                    │
                    ▼
             Contract Review
                    │
                    ▼
            Migration Design
                    │
                    ▼
             Compatibility Test
                    │
                    ▼
                Deployment
                    │
                    ▼
                Migration
                    │
                    ▼
              Verification
                    │
                    ▼
             Reconciliation
```

The governing rule is:

> **Change schema deliberately, migrate data explicitly, preserve canonical meaning, protect tenant boundaries, and never make production content depend on undocumented database history.**

This allows Payload to evolve without turning every new field, tenant requirement or framework upgrade into an uncontrolled platform compatibility risk.