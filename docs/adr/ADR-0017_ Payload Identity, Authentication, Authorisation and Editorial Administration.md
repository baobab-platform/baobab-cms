# ADR-0017: Payload Identity, Authentication, Authorisation and Editorial Administration

**Status:** Accepted  
**Date:** 2026-09-04  
**Decision Class:** Platform Architecture / Security / Content Administration  
**Scope:** Baobab Content Engine  
**Repository:** `baobab-platform/baobab-cms`  
**Parent ADRs:**  
- `ADR-0011-adopt-payload-cms-as-the-baobab-content-engine.md`
- `ADR-0012-payload-multi-tenancy-and-content-isolation-architecture.md`
- `ADR-0014-payload-digital-estate-market-locale-and-content-inheritance.md`

**Related Systems:** Baobab Control Plane, Identity Provider, Digital Estates, Baobab Trade Engine  
**Supersedes:** None  
**Architectural Style:** Federated identity, context-bound authorisation, least privilege, separation of platform and editorial administration

---

# 1. Context

Payload CMS includes its own authentication and administrative capabilities.

Baobab, however, is a multi-engine enterprise platform with:

- multiple tenants;
- multiple legal entities;
- multiple digital estates;
- multiple markets;
- multiple roles;
- multiple engine instances;
- organisation-wide identity and security requirements.

Payload must therefore participate in the platform identity model without becoming a separate enterprise identity authority.

A Payload user account cannot, by itself, define:

- canonical actor identity;
- tenant membership;
- legal-entity membership;
- platform role;
- capability entitlement;
- engine-instance access;
- cross-engine administrative authority.

The Content Engine requires a security model that distinguishes:

```text
Who are you?
```

from:

```text
Which tenant/context are you acting in?
```

and from:

```text
What are you allowed to do there?
```

---

# 2. Problem Statement

A naïve Payload deployment could treat every CMS user as a locally administered independent identity.

That would lead to:

```text
Payload user database
       =
enterprise identity system
```

and potentially:

```text
Payload role
       =
platform role
```

This is insufficient for Baobab because a user may have different authority across:

- tenants;
- legal entities;
- digital estates;
- markets;
- content types;
- capabilities.

For example, one actor may be:

```text
Editor for Digital Estate A
Reviewer for Digital Estate B
No access to Digital Estate C
No commerce administration rights
No platform administration rights
```

The architecture must support such distinctions explicitly.

---

# 3. Decision

Baobab SHALL use a **federated identity and context-bound authorisation model** for Payload CMS.

Canonical user or service identity SHALL originate from the platform-approved identity system.

Payload SHALL maintain only the local representation necessary for Content Engine operation.

Authorisation SHALL be evaluated using:

```text
Actor
+
Tenant
+
Legal Entity
+
Digital Estate
+
Market
+
Capability
+
Role
+
Permission
+
Resource
+
Operation
+
Isolation Profile
```

as applicable.

---

# 4. Authentication Versus Authorisation

Baobab SHALL preserve the distinction:

```text
Authentication
     =
Who is the actor?
```

and:

```text
Authorisation
     =
May the actor perform this operation in this context?
```

Authentication success SHALL NOT imply Content Engine access.

---

# 5. Canonical Actor Identity

Actors SHALL have stable canonical identity independent of Payload.

An actor may be:

- human user;
- service account;
- workload identity;
- automation;
- system principal.

Payload-local user IDs SHALL remain external engine identifiers.

---

# 6. Payload User Is Not Canonical Actor

A Payload user record SHALL represent a Content Engine projection or local runtime identity.

It SHALL NOT replace the canonical actor identity.

Conceptually:

```text
Canonical Actor
      │
      ▼
ExternalReference
      │
      ▼
Payload User
```

---

# 7. Identity Provider

Baobab SHOULD rely on a platform-approved identity provider for enterprise authentication.

The exact identity provider is an implementation decision unless separately governed.

Payload SHALL integrate through standard supported mechanisms where practical.

---

# 8. Local Authentication

Local Payload credentials MAY exist for:

- bootstrap;
- local development;
- break-glass recovery;
- controlled emergency administration.

They SHALL NOT become the ordinary enterprise authentication model.

---

# 9. Single Sign-On

Production editorial administration SHOULD support single sign-on where the platform identity environment provides it.

This allows:

- central account lifecycle;
- stronger authentication;
- consistent access revocation;
- organisational identity governance.

---

# 10. MFA

Privileged administrative access SHOULD require multi-factor authentication where supported by the identity architecture.

---

# 11. Tenant Membership

Tenant membership SHALL be platform-governed.

Payload SHALL not independently conclude that a user belongs to a tenant merely because a local user record contains a tenant field.

Membership claims SHALL originate from trusted identity/context data or approved projections.

---

# 12. Context Selection

A user may be authorised for more than one context.

The administrative experience SHALL make the effective context explicit.

For example:

```text
Actor
   │
   ├── Tenant A / Estate A
   ├── Tenant A / Estate B
   └── Tenant B / Estate X
```

The current context SHALL be unambiguous before protected actions occur.

---

# 13. Context Switching

Context switching SHALL be explicit and authorised.

The user SHALL NOT gain access to another tenant merely by changing:

- query parameter;
- URL;
- request header;
- browser state.

---

# 14. Trusted Context

Effective context SHALL be validated against the actor's authorised bindings.

Payload SHALL not trust arbitrary client assertions.

---

# 15. Role Model

Roles SHALL be context-aware.

A role granted in Tenant A SHALL not automatically apply in Tenant B.

---

# 16. Platform Roles Versus Content Roles

Baobab SHALL distinguish:

```text
Platform Administration
```

from:

```text
Content Administration
```

A Content Engine administrator SHALL not automatically become a Control Plane administrator.

Likewise, a Control Plane operator SHALL not automatically receive editorial authority unless explicitly granted.

---

# 17. Suggested Editorial Roles

The Content Engine MAY support roles equivalent to:

```text
Viewer
Author
Editor
Reviewer
Publisher
Content Administrator
```

Exact naming is implementation-specific.

Their semantics SHALL be governed.

---

# 18. Viewer

A Viewer MAY inspect authorised content but SHALL not mutate it.

---

# 19. Author

An Author MAY create and edit content in an authorised scope.

Publication rights need not be included.

---

# 20. Editor

An Editor MAY modify broader editorial content and manage structured content relationships within an authorised scope.

---

# 21. Reviewer

A Reviewer MAY participate in approval workflows without necessarily having publication authority.

---

# 22. Publisher

A Publisher MAY publish eligible content within an authorised context.

Publishing is a privileged editorial operation.

---

# 23. Content Administrator

A Content Administrator MAY manage Content Engine-specific configuration and user projections within governed limits.

This role SHALL not automatically imply unrestricted platform authority.

---

# 24. Platform Administrator

Platform administration belongs outside the ordinary Payload editorial model.

A platform administrator may have authority over:

- tenants;
- engine instances;
- capability bindings;
- isolation profiles;
- canonical contexts.

Those concerns belong to the Control Plane.

---

# 25. Role Composition

A user MAY possess multiple roles.

Effective permission SHALL be computed from authorised role/capability assignments.

---

# 26. Permission Model

Permissions SHOULD describe operations such as:

```text
read
create
update
delete
review
publish
unpublish
archive
manage_media
manage_navigation
manage_schema
administer_content
```

The exact set SHALL remain contractually governed.

---

# 27. Resource Scope

Permissions SHALL apply to explicit resource scopes.

Examples:

```text
Page
Article
Media
Navigation
ProductContent
Campaign
```

A generic "editor" role SHALL not imply every possible content permission without policy.

---

# 28. Operation Context

Authorisation SHALL evaluate:

```text
actor
resource
operation
context
```

not merely role name.

---

# 29. Default Deny

The Content Engine SHALL use a default-deny authorisation posture.

If an operation cannot be proven authorised, it SHALL be rejected.

---

# 30. Least Privilege

Actors SHALL receive only permissions necessary for their responsibilities.

Convenience SHALL not justify broad cross-tenant or cross-estate rights.

---

# 31. Tenant Isolation

All authorisation SHALL preserve ADR-0012 tenancy rules.

Authorisation cannot widen beyond the actor's valid tenant scope.

---

# 32. Digital Estate Scope

An editor authorised for Digital Estate A SHALL not automatically edit content for Digital Estate B.

---

# 33. Market Scope

Where editorial rights differ by market, permissions SHALL be capable of expressing such restriction.

---

# 34. Locale Scope

Where localisation teams operate separately, rights MAY be restricted to specific locales.

For example:

```text
Actor A:
en-ZA

Actor B:
sw-UG
```

---

# 35. Legal Entity Scope

Where tenants contain multiple legal entities, rights MAY be narrowed to one or more legal entities.

---

# 36. Capability Binding

Access to the Content Engine SHALL depend on valid capability binding where the Control Plane model requires it.

A valid actor and tenant do not imply automatic entitlement to:

```text
content.management
```

or:

```text
content.publish
```

---

# 37. Capability and Role Are Distinct

A capability determines whether a context may consume a platform function.

A role/permission determines what an actor may do within that function.

These concerns SHALL not be collapsed.

---

# 38. Collection Access

Every protected Payload collection SHALL implement access rules for:

- read;
- create;
- update;
- delete.

Additional lifecycle operations SHALL be separately governed.

---

# 39. Field-Level Access

Sensitive fields MAY require field-level access controls.

Examples may include:

- embargo date;
- legal approval;
- publication controls;
- internal notes;
- restricted metadata.

---

# 40. Relationship Access

Authorisation SHALL also validate related records.

An editor SHALL not gain indirect access to restricted content through relationships.

---

# 41. Local API Access

Payload's local/internal API SHALL not become a means of bypassing authorisation.

Server-side code SHALL preserve effective context and policy unless operating under explicitly privileged system authority.

---

# 42. REST and GraphQL

Where exposed, REST and GraphQL access SHALL enforce equivalent authorisation semantics.

Protocol choice SHALL not alter access rights.

---

# 43. Administrative UI

Payload Admin SHALL serve editorial/content administration.

It SHALL NOT become the Baobab platform administration interface.

---

# 44. Administrative UI Context

The Admin UI SHOULD clearly expose:

- current tenant;
- current digital estate where relevant;
- current market where relevant;
- role/capability context.

This reduces accidental cross-context editing.

---

# 45. Cross-Tenant Administration

Cross-tenant editorial administration SHALL require explicit privileged authority.

It SHALL not be enabled by default.

---

# 46. Privileged Operations

Operations such as:

- cross-tenant access;
- schema administration;
- identity projection management;
- content transfer;
- global publication;
- bulk deletion;

SHALL be considered privileged.

---

# 47. Superuser Accounts

Payload-equivalent superusers SHALL be treated as highly privileged platform identities.

They SHALL:

- be minimised;
- be audited;
- not be shared;
- not be used for ordinary editorial work.

---

# 48. Break-Glass Access

The architecture SHOULD provide a governed break-glass mechanism for emergency access.

Such access SHOULD include:

- explicit activation;
- strong authentication;
- short-lived permission where practical;
- audit;
- post-event review.

---

# 49. Shared Accounts

Shared human administrative accounts are prohibited.

Actions SHALL be attributable to individual actors wherever possible.

---

# 50. Service Identities

Automations and integrations SHALL use dedicated service identities.

They SHALL not impersonate human editors through shared credentials.

---

# 51. Workload Identity

Where infrastructure supports workload identity, service authentication SHOULD prefer it over static long-lived credentials.

---

# 52. API Tokens

API tokens SHALL be:

- scoped;
- revocable;
- attributable;
- protected as secrets;
- rotated according to policy.

---

# 53. Long-Lived Tokens

Long-lived broadly privileged tokens SHOULD be avoided.

---

# 54. Token Context

Where tokens carry context claims, claims SHALL be validated.

Client possession of a token SHALL not permit arbitrary context substitution.

---

# 55. Token Audience

Tokens SHOULD be audience-restricted where supported.

A token intended for one engine SHOULD not automatically authenticate to every Baobab engine.

---

# 56. Token Expiry

Access tokens SHOULD be time-limited.

Refresh/session mechanisms SHALL follow identity-provider policy.

---

# 57. Session Security

Administrative sessions SHOULD protect against:

- hijacking;
- fixation;
- cross-site request forgery where relevant;
- unauthorised persistence.

---

# 58. Session Context

If context is stored in a session, switching context SHALL trigger proper revalidation.

---

# 59. Deprovisioning

When an actor loses organisational access, Content Engine access SHALL be revocable centrally.

Payload-local stale identity records SHALL not preserve authority after canonical access is revoked.

---

# 60. Suspended Users

Suspended canonical actors SHALL not continue ordinary Payload access.

---

# 61. Tenant Suspension

Tenant suspension SHALL affect Content Engine access according to Control Plane lifecycle policy.

---

# 62. Identity Projection

Payload MAY maintain a local actor projection.

Conceptually:

```text
ActorProjection
---------------
canonical_actor_id
display_name
email?
status
last_synced_at
```

This SHALL remain non-authoritative.

---

# 63. Sensitive Identity Data

Payload SHALL store only identity attributes necessary for Content Engine operation.

It SHALL not become an unnecessary copy of the enterprise identity directory.

---

# 64. Email Is Not Canonical Identity

Email addresses are mutable.

They SHALL not become canonical actor IDs.

---

# 65. Username Is Not Canonical Identity

Likewise, username or display name SHALL not define canonical actor identity.

---

# 66. Identity Mapping

Payload-local identities SHALL map to canonical actors using the canonical mapping/external-reference model where applicable.

---

# 67. Impersonation

Administrative impersonation, if ever supported, SHALL be strongly governed and auditable.

The actor initiating impersonation SHALL remain visible in audit records.

---

# 68. Delegated Administration

Tenant administrators MAY be allowed to manage editorial access within their authorised tenancy boundaries.

Delegated administration SHALL not permit:

- creation of platform administrators;
- changes to other tenants;
- isolation-profile changes;
- engine-instance changes.

---

# 69. Editorial Workflow

Authorisation SHALL support separation of duties.

For example:

```text
Author
   ↓
Reviewer
   ↓
Publisher
```

where organisational policy requires it.

---

# 70. Self-Approval

Some tenants MAY permit authors to publish their own content.

Others MAY prohibit it.

The workflow SHALL be policy-driven.

---

# 71. High-Risk Content

Certain content classes MAY require stronger approval.

Examples:

- legal notices;
- regulated disclosures;
- investor information;
- high-impact campaign changes.

The security model SHALL support content-type-specific workflow.

---

# 72. Publishing Authority

Publishing SHALL be distinct from editing.

The ability to edit content SHALL not automatically imply publication rights.

---

# 73. Unpublishing Authority

Unpublishing or withdrawing critical content MAY require separate permission.

---

# 74. Deletion Authority

Hard deletion SHALL be more restricted than ordinary editing.

Archive or soft-delete SHOULD be preferred where lifecycle policy requires recoverability.

---

# 75. Media Administration

Media upload and media deletion permissions MAY be separate from general page editing rights.

---

# 76. Product Content Rights

Editorial rights over `ProductContent` SHALL not grant commerce administration authority in Medusa.

---

# 77. Commerce Rights

Medusa product administration SHALL not grant Payload editorial authority unless separately assigned.

---

# 78. Schema Rights

Changing Payload collection schemas or platform configuration SHALL not be an ordinary editorial permission.

Schema governance is addressed further in ADR-0019.

---

# 79. Audit

Every privileged content operation SHOULD record:

- canonical actor;
- tenant;
- legal entity where applicable;
- digital estate;
- market;
- locale where relevant;
- resource;
- operation;
- timestamp;
- correlation ID;
- source;
- outcome.

---

# 80. Authentication Audit

Security-relevant events SHOULD include:

- successful login;
- failed login;
- privilege change;
- context switch where material;
- break-glass activation;
- token creation;
- token revocation.

---

# 81. Audit Immutability

Audit records SHOULD be protected against ordinary editorial modification.

---

# 82. Audit Separation

Editorial users SHALL not be permitted to rewrite audit history merely because they can edit content.

---

# 83. Observability

The system SHOULD expose metrics and alerts for:

- authentication failures;
- denied privileged operations;
- unusual cross-context access attempts;
- repeated tenant mismatches;
- break-glass use;
- service credential failures.

---

# 84. Security Events

Material security events MAY emit canonical security/audit events according to platform contracts.

---

# 85. Error Messages

Authorisation failures SHALL avoid exposing unnecessary information about resources outside the caller's scope.

---

# 86. Enumeration Resistance

Where appropriate, APIs SHOULD avoid revealing whether inaccessible tenant resources exist.

---

# 87. CSRF

Browser-based administrative operations SHALL use appropriate protections against cross-site request forgery where the authentication mechanism requires it.

---

# 88. XSS

Payload-admin and editorial rendering paths SHALL treat untrusted content appropriately.

Rich text does not imply trusted executable code.

---

# 89. Content Sanitisation

Where content may contain HTML or equivalent executable markup, sanitisation and rendering policies SHALL be explicit.

---

# 90. Script Injection

Ordinary editors SHALL not be permitted to inject arbitrary executable script into digital estates unless a dedicated trusted capability explicitly permits it.

---

# 91. Secrets

Secrets SHALL NOT be stored in editorial collections.

Examples include:

- API keys;
- service credentials;
- private keys;
- database passwords.

Secrets belong in approved secret-management systems.

---

# 92. Environment Configuration

Authentication secrets and provider configuration SHALL be injected through deployment/runtime configuration.

They SHALL not be hard-coded into repositories.

---

# 93. Development Environment

Local development MAY use simplified authentication.

However, integration and security tests SHALL exercise multi-actor and multi-tenant scenarios.

---

# 94. Test Actors

Test fixtures SHOULD include at minimum:

```text
Platform administrator
Tenant A administrator
Tenant A editor
Tenant B editor
Read-only actor
Service identity
```

---

# 95. Negative Tests

Security testing SHALL prove not only allowed paths but denied paths.

Examples:

```text
Tenant A editor cannot publish Tenant B page
Editor cannot change schema
Viewer cannot delete media
Service identity cannot access Admin UI
```

---

# 96. Identity Provider Failure

If the identity provider is unavailable, existing valid sessions MAY continue according to security policy.

New privileged access SHALL not silently fall back to insecure local authentication.

---

# 97. Control Plane Failure

Where local authorisation projections are permitted, Payload MAY continue operating temporarily using validated cached policy.

The allowed degradation window SHALL be explicit.

---

# 98. Stale Authorisation Projection

Stale security policy SHALL be treated more cautiously than stale descriptive metadata.

Sensitive operations SHOULD fail closed when authorisation freshness cannot be established.

---

# 99. Role Changes

Role or capability revocation SHOULD propagate promptly.

Security-sensitive cache entries SHALL be invalidated accordingly.

---

# 100. Permission Caching

Permission decisions MAY be cached only where:

- context is included;
- actor is included;
- policy version is included;
- revocation latency is acceptable.

---

# 101. Cross-Region Identity

Regional Payload instances SHALL evaluate equivalent canonical identity and authorisation semantics.

A user SHALL not gain broader rights merely by reaching another region.

---

# 102. Regional Administration

Regional deployment topology SHALL not create separate independent enterprise identity silos.

---

# 103. Data Residency

Identity projections SHALL respect data-minimisation and residency requirements where applicable.

---

# 104. External Contributors

The model MAY support external agencies, contractors or partners.

Such actors SHALL receive narrowly scoped, time-bound access where appropriate.

---

# 105. Temporary Access

Temporary assignments SHOULD support explicit expiry.

---

# 106. Organisation Changes

An actor moving between business units, legal entities or tenants SHALL not retain obsolete Content Engine privileges.

---

# 107. Tenant Offboarding

Tenant offboarding SHALL include:

- user access revocation;
- service-token revocation;
- local projection deactivation;
- administrative-session termination where feasible.

---

# 108. Service Offboarding

When an integration is retired, its service identity SHALL be revoked.

---

# 109. No Hard-Coded Roles Per Organisation

Application code SHALL NOT contain logic such as:

```text
if tenant == "thamami":
    role = publisher
```

or equivalent organisation-specific shortcuts.

Access variation SHALL be configuration and policy driven.

---

# 110. Contract Governance

Cross-repository actor, role, capability and security-context schemas SHALL be governed in `baobab-platform/shared`.

Payload SHALL consume those contracts rather than defining divergent equivalents.

---

# 111. API Contract

Authorised Baobab-facing APIs SHOULD carry or derive:

- canonical actor;
- canonical context;
- capability;
- correlation ID.

---

# 112. Reconciliation

Identity/access reconciliation SHALL detect:

- unknown local users;
- stale actor projections;
- role assignments referencing retired actors;
- access to inactive tenants;
- expired temporary grants;
- orphaned service identities.

---

# 113. Rejected Alternative: Payload as Enterprise Identity Provider

Rejected.

The CMS is not the platform identity authority.

---

# 114. Rejected Alternative: One Global CMS Role

Rejected because permissions differ by tenant, estate, market and resource.

---

# 115. Rejected Alternative: Payload Admin Equals Platform Admin

Rejected because editorial administration and platform control are separate authority domains.

---

# 116. Rejected Alternative: Email as Identity

Rejected because email addresses change and may not uniquely represent all actor types.

---

# 117. Rejected Alternative: Local Password Accounts as Default Production Authentication

Rejected as the enterprise norm.

Local credentials remain exceptional.

---

# 118. Rejected Alternative: Shared Superuser

Rejected because it destroys accountability and dramatically increases blast radius.

---

# 119. Rejected Alternative: Role Name Alone Determines Access

Rejected because access depends on context, resource and operation.

---

# 120. Rejected Alternative: Trust Caller-Supplied Tenant

Rejected because tenant/context must be validated against actor authority.

---

# 121. Rejected Alternative: Permanent Cross-Tenant Editors

Rejected as the default model.

Cross-tenant access requires explicit privileged assignment.

---

# 122. Consequences

## 122.1 Positive

This decision provides:

- central identity governance;
- tenant-aware administration;
- least privilege;
- clear separation of editorial and platform administration;
- better revocation;
- stronger auditability;
- SSO compatibility;
- service identity governance;
- scalable delegated administration.

## 122.2 Negative

The architecture introduces:

- identity integration;
- local projections;
- policy evaluation;
- contextual administration;
- role/capability management;
- synchronisation requirements;
- more sophisticated testing.

These costs are accepted.

---

# 123. Architectural Invariants

1. Payload is not the canonical enterprise identity authority.
2. Payload user ID is not canonical actor identity.
3. Authentication and authorisation remain distinct.
4. Tenant membership is platform-governed.
5. Context switching is explicit and authorised.
6. Access is default-deny.
7. Permissions are context-aware.
8. Roles are not globally transferable across tenants by default.
9. Platform administration and content administration are separate.
10. Publishing permission is distinct from editing permission.
11. Capability and role are separate concepts.
12. Shared human administrative accounts are prohibited.
13. Superuser access is exceptional.
14. Service integrations use service identities.
15. Arbitrary client context assertions are not trusted.
16. Email is not canonical identity.
17. Username is not canonical identity.
18. Local authentication is exceptional in production.
19. Secrets are not stored in content.
20. Editorial access cannot grant commerce authority.
21. Commerce authority cannot implicitly grant editorial authority.
22. Authorisation applies across REST, GraphQL, Local API and Admin UI.
23. Relationship traversal cannot bypass access controls.
24. Security-sensitive stale policy fails conservatively.
25. Privileged operations are auditable.
26. Role/capability revocation propagates.
27. Organisation-specific permission branches in code are prohibited.
28. Cross-repository identity contracts belong in `baobab-platform/shared`.

---

# 124. Required Conformance Tests

## CT-001 — Canonical Identity

A Payload user maps to a canonical actor without Payload ID becoming canonical identity.

## CT-002 — Tenant Isolation

Tenant A editor cannot read or mutate Tenant B protected content.

## CT-003 — Estate Isolation

An estate-scoped editor cannot edit another estate without additional authority.

## CT-004 — Role Separation

An Author cannot publish where Publisher permission is required.

## CT-005 — Platform Separation

A Content Administrator cannot alter Control Plane tenant configuration.

## CT-006 — Commerce Separation

Payload editorial rights do not grant Medusa product administration.

## CT-007 — Context Spoofing

Changing a tenant/context parameter does not expand authority.

## CT-008 — Local API Enforcement

Server-side Payload Local API calls preserve access controls unless explicitly privileged.

## CT-009 — GraphQL Enforcement

GraphQL cannot expose content unavailable through equivalent authorised access.

## CT-010 — Relationship Isolation

Relationship traversal cannot reveal inaccessible tenant content.

## CT-011 — Revocation

Removing an actor's entitlement removes Content Engine access within the defined propagation window.

## CT-012 — Service Identity

Service credentials cannot access human administrative functions unless specifically authorised.

## CT-013 — Shared Account Prevention

Administrative actions remain attributable to distinct actor identities.

## CT-014 — Stale Policy

Privileged operations fail safely when required authorisation state is untrustworthy.

## CT-015 — Audit

Privileged publication and administrative operations create actor/context-aware audit records.

---

# 125. Implementation Direction

A suitable security boundary MAY resemble:

```text
src/
└── baobab/
    ├── identity/
    │   ├── provider/
    │   ├── actors/
    │   ├── projections/
    │   └── sessions/
    │
    ├── authorization/
    │   ├── roles/
    │   ├── permissions/
    │   ├── policies/
    │   ├── capabilities/
    │   └── evaluators/
    │
    ├── context/
    ├── audit/
    ├── admin/
    └── security/
```

Exact file layout is non-normative.

The identity/authorisation separation is normative.

---

# 126. Decision Outcome

The Content Engine SHALL participate in Baobab's enterprise security model without becoming a security island.

The governing architecture is:

```text
                    CANONICAL ACTOR
                           │
                           ▼
                    Authentication
                           │
                           ▼
                     Baobab Context
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
            Tenant      Capability     Role
              │            │            │
              └────────────┼────────────┘
                           ▼
                    Authorisation
                           │
                           ▼
                    Payload Access
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
            Read          Edit        Publish
```

The governing rule is:

> **Payload authenticates and administers content within Baobab's trusted identity and context model; it does not independently determine who belongs to the platform or what enterprise authority they possess.**

This preserves tenant isolation, supports delegated editorial administration and keeps platform, commerce and content privileges cleanly separated.