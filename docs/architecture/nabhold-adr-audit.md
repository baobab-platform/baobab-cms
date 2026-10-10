# ADR audit for the Nabhold work (CMS ADR-0011 to ADR-0020, estate ADR-NAB-0002)

Reviewed 2026-10-09 against the code on `ccr-0091ad61-xmo5ln`. "Conforms" means the code was read and tested; it is not a certification.

| ADR | Verdict | Evidence and gaps |
|---|---|---|
| 0011 Payload as the content engine | Conforms | Capability `content.entry.resolve` declared PARTIAL; route is a provider, not a gateway for business payloads. |
| 0012 Tenancy and isolation | Conforms, with one gap | New collections carry tenant, scope and scoped slugs; every resolve read filters by the mapped tenant. Gap: `pages` and `product-content` are not covered by the new role guard. |
| 0013 Canonical identity | Conforms | `SITE_CONFIGURATION` entities get canonical ids; the Control Plane tenant and organisation ids are stored separately and never minted here. |
| 0014 Estate, market, locale, inheritance | Partly conforms | Resolver and contract handler follow the rules and were exercised on PostgreSQL. Gaps: no locale fallback chains configured; `COMPOSE` returns 422; scope uses `legal_entity_id` while ADR-BCP-027 points to the Organisation. |
| 0015 Product content composition | Not touched | |
| 0016 Media | Not touched | SEO images reference media; media publication is not role-guarded. |
| 0017 Identity and authorisation | Conforms after fixes, with gaps | Found and fixed: users could change their own roles, capabilities and tenant. Publication permissions are enforced on the new collections. Gaps: no review state (REVIEWER is advisory), no four-eyes approval, IAM group to role mapping undefined, production sign-in blocked on IAM federation. |
| 0018 Events and outbox | Conforms | Events now carry collection, slug and content key; revalidation delivery is at-least-once with retry, dead-letter and stale-lease recovery. Gaps: no coalescing, no scheduled dispatcher, no alert on dead letters. |
| 0019 Schema governance | Conforms, one note | All changes are migrations with verified down paths. The CMS-NAB-03 layout was replaced by a drop-and-add pair (two migrations); safe because nothing had consumed it, but it is a destructive step to flag. |
| 0020 Deployment and resilience | Not met | No deployment, no environment, no schedule, no AWS account. Recorded as an upstream blocker. |
| Estate ADR-NAB-0002 | Conforms with a mismatch to resolve | Field names match the estate DTO. The estate's revalidate endpoint names the five singletons under `pages`, so the CMS sends that form for `site-configurations` records. Static bearer secret, not signed. |
| CP ADR-BCP-026 / 027 (treated as accepted) | Aligned in the CMS; open in Shared and CP | Primary Organisation is separate from the legal entity in the CMS. Shared tenant read model and `content/v1` still lack the Organisation. The ADR files still read Proposed. |

New decisions are recorded in `docs/adr/ADR-0021_ Corporate Singleton Content, Local Projection Onboarding and Estate Revalidation.md`.
