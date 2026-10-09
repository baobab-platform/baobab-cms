# ADR-0021: Corporate singleton content, local-projection onboarding and estate revalidation

Status: Proposed
Date: 2026-10-09
Context: Nabhold corporate digital estate onboarding (gates CMS-NAB-01 to CMS-NAB-09)
Refines: ADR-0012, ADR-0014, ADR-0017, ADR-0018, ADR-0019. Aligns with Control Plane ADR-BCP-026 and ADR-BCP-027.

## Context

The Nabhold estate needs five singleton pieces of content (home, navigation, footer, site settings, group profile) and three list types
(portfolio, sectors, insights), published through the CMS and refreshed in the estate's cache. The Control Plane cannot yet issue the
tenant, so the CMS holds local projections. Several choices were made while building this and are recorded here for review.

## Decisions

1. **Singletons live in a scoped collection, not Payload Globals and not `pages`.** `site-configurations` holds one record per
   (tenant, digital estate, locale, kind). Globals have no tenant, estate or locale scope, no resolution and no canonical events. `pages`
   is for routable documents. `home` stays a `pages` record. Field names follow the estate's content contract so `content.entry.resolve`
   returns what the estate already reads.
2. **Onboarding writes projections only, and never in production.** `scripts/onboarding/nabhold.ts` and `nabhold-content.ts` default to
   dry-run, need `--projection-mode local` to write, refuse production, never overwrite, create no human account, and fill the Control
   Plane tenant and organisation ids only from a supplied issuance and only when blank.
3. **The primary Organisation is a Control Plane id on the organisation projection**, never derived from the legal-entity reference
   (ADR-BCP-027). The legal-entity reference stays optional and per operation.
4. **Publication is gated by role.** Create, update, publish, unpublish, archive and delete need the matching permission, publishing also
   needs `content.publish`, and identity and entitlement fields on users change only by a platform administrator.
5. **Estate cache refresh uses the outbox.** A publisher scoped to the Nabhold tenant sends the estate's narrow revalidate request;
   permanent failures dead-letter at once, others retry with backoff, and entries stranded in `PUBLISHING` become due again.
6. **The provider route fails closed.** `POST /v1/content/resolve` verifies the caller, requires scopes, has the Control Plane validate the
   context, and refuses all calls unless configured. The provider declaration says PARTIAL; nothing here is a binding or activation.
7. **The reconciliation report cannot assert activation.** Findings are EVIDENCED, DECLARED, PLANNED, UNVERIFIED or BLOCKED, and only a
   Control Plane answer can confirm anything.

## Consequences

- If ADR-BCP-027 is accepted as written, Shared `content/v1` and the tenant read model need an `organisation_id` dimension, and the
  `legal_entity_id` scope used for resolution today becomes a compatibility value.
- `pages` and `product-content` are not yet behind the publication guard. Applying it needs a migration plan for editors who rely on the
  legacy `roles` field (ADR-0019).
- Locale fallback chains are not configured, `COMPOSE` content is unsupported, and the dispatcher has no deployment, schedule or alert.
- The estate's revalidate endpoint uses a static bearer secret; signed requests would need a change there.
