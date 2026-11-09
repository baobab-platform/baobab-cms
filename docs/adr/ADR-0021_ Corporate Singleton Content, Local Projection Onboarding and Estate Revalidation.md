# ADR-0021: Scoped corporate content, governed local projections and provider-neutral estate revalidation

Status: Accepted
Date: 2026-10-09
Accepted: 2026-11-09
Context: Baobab CMS onboarding and content delivery for Nabhold, ZuriBeans, Thamani and independent external tenants; Nabhold gates CMS-NAB-01 to CMS-NAB-09 remain the initial reference case.
Refines: ADR-0012, ADR-0014, ADR-0017, ADR-0018, ADR-0019. Aligns with Control Plane ADR-BCP-026 and ADR-BCP-027.

## Context

Nabhold's initial corporate estate requires five content areas (home, navigation, footer, site settings and group profile) and three lists (portfolio, sectors and insights), published through CMS and reflected in the estate's cache. The home document is routable content, while navigation, footer, site settings and group profile are scoped singletons. At the time of initial onboarding the Control Plane could not yet issue the tenant and organisation, so CMS held local projections.

Nabhold is the first reference implementation, **not the architectural boundary**. ZuriBeans is a commodity-trading estate, Thamani is a logistics estate, and external tenants may operate their own independently branded estates, identity arrangements and cache/content-delivery providers. Their editorial schemas, singleton kinds, provider choices and publication policies must not be silently inherited from Nabhold. Reusing the platform must not mean reusing Nabhold's tenant, permissions, endpoints or secrets.

This decision accepts the governing pattern and its constraints; it does **not** declare a Control Plane binding activated, a provider integrated, or a production deployment qualified.

## Decisions

### 1. Tenant- and estate-scoped content, not Payload Globals

- `site-configurations` holds at most one active record per **(tenant, digital estate, locale, kind)**. A PostgreSQL-enforced unique invariant, consistent with the record lifecycle/soft-deletion policy, is required for concurrency safety; a Payload validation query alone is not sufficient.
- Payload Globals do not represent tenant-, estate- or locale-scoped canonical content and must not be substituted for this collection. `pages` remains the home for routable documents, including a routable `home` page. List collections remain separate editorial resources.
- The approved **estate content profile** declares the kinds and schema contracts needed by that estate. Nabhold's navigation, footer, site settings and group-profile kinds are an initial profile; an estate is not obliged to create a group profile, portfolio, sectors or insights when its approved content contract does not require them. New kinds require versioned contracts and migrations, not an arbitrary client-selected bypass of validation.
- The resolver and publication pipeline use verified tenant, digital-estate and locale dimensions and the estate's registered content contract. `content.entry.resolve` must return the contract expected by that consumer; any fallback or `COMPOSE` behavior requires a separately approved, tested policy. Unbound dimensions, ambiguous matches and cross-tenant reads fail closed.
- Digital estates retain independent branding, typography, presentation and application behavior; CMS standardises the governed content and delivery interfaces, not visual identity.

### 2. Governed, provider-neutral onboarding and local projections

- Local projection tooling is **development-only**. Existing `scripts/onboarding/nabhold.ts` and `nabhold-content.ts` are reference adapters, not mandatory entry points for other estates. An engine-neutral onboarding workflow accepts an explicitly selected, versioned estate manifest/adapter for Nabhold, ZuriBeans, Thamani or an independent tenant.
- All such local tooling defaults to dry-run, requires an explicit `--projection-mode local` (or equivalently strict opt-in) to write, refuses production, never overwrites issued identifiers or existing data, and never creates a human user or grants IAM entitlement.
- The Control Plane remains the authority for canonical tenant, organisation, market, estate and approved capability/binding identifiers. A CMS projection is a read model, not an issuance mechanism. Control Plane identifiers may be filled only from independently supplied, verified issuance and only when currently blank; no ID may be inferred from a display name, domain, legal-entity reference or a fixture.
- Production onboarding must use a governed Control Plane/IAM-authorised path with auditable reconciliation and idempotent projection updates. A local development fixture is never evidence of production provisioning. External tenants receive independently issued identities and explicit entitlements; no group-affiliation or Nabhold default grants access.
- Manifests and adapters may provide estate-specific seed content and mappings but cannot override these shared security, ownership or reconciliation rules.

### 3. Organisation is distinct from legal entity

The primary Organisation is the **Control Plane organisation ID** recorded on the organisation projection, never a value derived from `legal_entity_id` (ADR-BCP-027). Legal-entity references are separately resolved where the operation requires them. The corresponding Shared `content/v1` and tenant-read-model contracts must accommodate an `organisation_id` dimension when the authoritative Control Plane contract provides it; any legacy `legal_entity_id` resolution behavior must be versioned as compatibility, not reinterpreted as Organisation ownership.

### 4. Publication authority is explicit and estate-scoped

Create, update, publish, unpublish, archive and delete require the matching permission in the verified tenant/estate context. Publication additionally requires `content.publish`. Identity and entitlement fields on user records can be changed only by a platform administrator acting under the applicable IAM/Control Plane policy. A legacy `roles` field is not an independent source of broad grants.

The same policy applies across `site-configurations`, `pages`, `product-content` and other publishable collections, with separately versioned collection-specific exceptions where necessary. Any transition of legacy editors/roles requires the ADR-0019 migration and negative-permission regression evidence. No estate's editor or publisher is implicitly authorised to modify another estate's content.

### 5. Outbox-driven, provider-neutral revalidation

- A committed editorial publication creates a durable, canonical CMS outbox event scoped to the authorised tenant, estate, locale, content identity and version (or other approved immutable revision reference). Content and outbox persistence are coordinated transactionally where the engine contract requires it. Event IDs and downstream delivery attempts support idempotent processing and independently inspectable audit/correlation.
- A **revalidation binding** selects the approved destination/strategy for each consumer estate and environment. Reusable adapter choices may include a signed webhook to a Next.js estate, a provider's authenticated CDN/cache-tag purge API, or a supported message/event consumer. Nabhold's narrow revalidation route is one adapter, **not** the universal Baobab endpoint. An external tenant may retain an existing preferred provider when an adapter can satisfy the contract and policy.
- CMS dispatch resolves destination, credentials and scope from authorised configuration/bindings, not tenant-name conditionals or a global Nabhold secret. Missing/disabled/ambiguous bindings or failed authority checks do not cause fallback delivery to another estate. Adapter capabilities and limitations (including cache tagging, acknowledgement and replay support) are declared and qualified before activation.
- The transport uses TLS and provider-appropriate authenticated requests. Where webhooks are used in production, they must use verifiable signatures, freshness/expiry and replay protection; API providers may use their supported scoped credentials and equivalent replay/idempotency controls. Secrets are isolated by binding and environment, securely managed, rotated and excluded from logs. The Nabhold static-bearer implementation is a **legacy development-only compatibility route**, not the approved production credential model.
- Transient delivery failures retry with bounded backoff, permanent failures dead-letter, and abandoned `PUBLISHING` records become due again under a safe lease/recovery policy. Duplicate events and committed-result loss must not yield duplicate externally consequential work. Failure, lag, dead-letter and stale-cache conditions need monitoring, runbooks, replay ownership and evidence.
- Revalidation is not a license to cross tenant boundaries: only content covered by the event's verified estate/locale binding may be invalidated. Acknowledgement of the provider request does not by itself prove browser-visible cache freshness; estate-specific readback or equivalent qualification is needed.

### 6. Content provider route fails closed

`POST /v1/content/resolve` must verify its caller, require the necessary scopes and have the Control Plane validate the tenant/organisation/estate/market context according to the current canonical contracts. Without configured, qualifying identity and authority integration the route refuses calls. The provider declaration remains **PARTIAL** until independent binding/activation evidence exists; a working local projection, test double or successful CMS request cannot elevate its status.

### 7. Reconciliation reports never assert activation on their own

Reports classify findings as **EVIDENCED**, **DECLARED**, **PLANNED**, **UNVERIFIED** or **BLOCKED**, preserving source, environment, time and correlation. Only the Control Plane's authoritative answer confirms activation, binding or provisioned identity. Estate onboarding and revalidation checks are reported per tenant and estate; evidence from Nabhold cannot qualify ZuriBeans, Thamani or independent external tenants by inheritance.

## Provider-neutral contracts and ownership

| Responsibility | Authoritative owner | Required boundary |
| --- | --- | --- |
| Tenant, Organisation, market and digital-estate issuance/bindings | Control Plane (with IAM authority) | No self-issuance by CMS or an estate |
| Editorial schemas, scoped singleton content, publication and canonical outbox | CMS/Payload | Tenant/estate/locale isolation and approved content profiles |
| Revalidation dispatch and adapters | CMS integration runtime operating under approved bindings | Per-estate destination, scoped credentials, idempotency and delivery evidence |
| Rendering, local cache, invalidation endpoint and provider selection | Each digital estate or its approved provider | Independent branding and independently qualified cache behaviour |
| Cross-component readiness and activation | Control Plane governance | Explicit evidence and no activation inferred from fixtures |

An adapter is replaceable without a new core CMS business rule, provided its content-event contract, authority, security and operational qualification remain equivalent. Neither Nabhold-specific URL paths nor its content taxonomy may be embedded in the shared dispatcher as a platform default.

## Acceptance and qualification requirements

Acceptance of this ADR authorises the architecture; engineering work may remain partial until the following are evidenced:

1. **Content isolation and integrity:** PostgreSQL 17 tests verify the one-active-singleton invariant under concurrent create/update, per-(tenant, estate, locale, kind) separation, page/singleton resolution and refusal of forged or unbound context dimensions.
2. **Onboarding safeguards:** Dry-run default, explicit local-write opt-in, production refusal, zero user/entitlement creation, immutable issued IDs and refusal of unverified issuance; independent tenant fixtures must not inherit Nabhold bindings.
3. **Editorial authority:** Allowed and denied lifecycle transitions for writers, publishers and administrators, including legacy-role migration and cross-estate negative cases.
4. **Provider-neutral delivery:** At least one working Nabhold adapter and a second, differently configured estate/provider adapter; binding-based routing, signed/authenticated request verification, retry, dead-letter, stuck-`PUBLISHING` recovery, replay/idempotency and no cross-tenant invalidation.
5. **Independent consumer qualification:** A Nabhold CMS-NAB-01–09 witness plus representative ZuriBeans, Thamani and independently owned external-tenant acceptance scenarios, using each estate's approved content profile. Tests must record clearly when a provider sandbox or Control Plane/IAM integration is not genuinely connected.
6. **Operational readiness:** Environment-isolated credentials, deployment/scheduling, telemetry, alerting, runbooks and verified content-to-cache readback. Provider and Control Plane activation are separately evidenced.

These checks are **qualification gates**, not statements that current code already satisfies them. Existing ADR-0021 implementation work, including singleton ownership validation, is incremental; a request-time uniqueness validator alone is not the PostgreSQL concurrency guarantee.

## Consequences and migration

- Existing Nabhold content contracts and CMS-NAB-01–09 remain supported as the first reference profile. Generalisation is additive and must not silently change live field names, consumer payload shape or routes; version/migrate contracts as necessary.
- Shared `content/v1`, Control Plane tenant read models and CMS mapping/resolution may require coordinated `organisation_id` contract changes. Keep `legal_entity_id` compatibility explicit until the authoritative contract and migration are qualified.
- The `pages` and `product-content` publication guard coverage, legacy `roles` migration, locale fallback, `COMPOSE` support and PostgreSQL unique index require individual implementation evidence, regardless of any related open pull requests.
- Deployment, scheduling, observability and recovery of the outbox dispatcher remain engineering obligations. Production signed webhooks and other provider-native authentication require consumer/provider changes; the existing static bearer must not be treated as production acceptance.
- Adding a new digital estate or external tenant should normally mean configuring a new governed content profile and approved adapter binding, **not forking CMS or copying Nabhold's credentials and tenancy defaults**.

## Decision record

Accepted on 2026-11-09: generalise the initial Nabhold onboarding/revalidation decisions into an estate-neutral, provider-neutral Baobab CMS contract while retaining Nabhold as the reference case. **Accepted means architectural approval, not completion or activation of implementation gates.**
