# Impact of Control Plane ADR-BCP-026 and ADR-BCP-027 on the Nabhold CMS work

Reviewed 2026-10-09 against baobab-cp `main` (ADR-BCP-026, merged, **Proposed**), baobab-cp PR #291 (ADR-BCP-027, open,
**Proposed**), baobab-cp PR #289 and Shared PR #255 (NBO-01 staff-assisted admission, open). Nothing below treats a Proposed
decision as accepted; it records where our code would need to change if they are accepted, and what we do meanwhile.

## What the two ADRs say that touches the CMS

- **027:** a Tenant's identity is its PRIMARY Organisation (a Control Plane identifier). `legal_entity_id` becomes an optional,
  per-operation legal-actor relationship (a "mandate"), never inferred from the tenant, and never a placeholder. A trading name is
  not a legal entity. Registry membership is not proof of incorporation. Nothing a parent legal entity does gives access to
  another tenant.
- **026:** founding-group businesses get a governed admission path and a bounded evidence deferral; evidence posture, admission,
  entitlement and provider readiness stay separate decisions. Admission is not activation.
- **NBO-01 (#289, #255):** the staff-assisted `INTERNAL_GROUP` intake that Nabhold's own admission will use. Still open and
  unmerged, and its own blockers list says Nabhold and Thamani incorporation claims need independent review and that no
  Nabhold tenant exists.

## Where our work already fits

| Area | Why it holds |
|---|---|
| Tenant projection | Stores no legal-entity requirement and no registration, tax or address facts. `controlPlaneTenantId` is an opaque Control Plane id that is never invented. |
| Isolation | Parent or group status grants nothing; every read filters by the mapped tenant. |
| Activation | Nothing is activated; the resolve capability stays CONTRACTED and the route refuses unless configured. |
| Evidence honesty | Seeds make no claim about registration, ownership or incorporation. |

## Where our work would need to change if both are accepted

1. **Organisation versus legal entity.** `organisations.canonicalLegalEntityId` and the label "Legal entity (organisation)" on
   `pages`, `site-configurations` and the corporate collections treat an Organisation and a legal entity as one thing. For Nabhold
   they coincide, so nothing is wrong today; for ZuriBeans trading under Nabhold they would not. The CMS needs a Control Plane
   `organisation_id` (PRIMARY Organisation) projection, with the legal entity kept optional.
2. **Content resolution scope.** Shared `content/v1` (merged in #254) scopes by `legal_entity_id`. Under 027 the stable
   dimension is the Organisation. That needs a Shared amendment adding `organisation_id`; the CMS must not change the contract
   locally. Until then `NABHOLD` serves as the legal-entity dimension for Nabhold only.
3. **Nabhold onboarding profile.** The estate profile and ADR-NAB-0012/0013 name `legal_entity_id: NABHOLD` as the tenant's
   identity. Tenant registration under 027 is Organisation-first. Those documents should say the legal entity is a mandate
   reference, not the tenant key (nabhold repo, documentation only).
4. **Registry record (merged Shared #252).** It records the CIPC identity with an evidence pointer. 027 says a registry entry
   must not double as incorporation verification. The CMS therefore reports legal-person status as "claimed, evidence pointer
   present, no Control Plane verification case", never as verified.
5. **ZuriBeans seed (`scripts/onboarding/zuribeans.ts`, pre-existing).** It models ZuriBeans as its own legal entity. Under 027 that
   may be a falsely asserted legal person. Not changed here; flagged for its owner.

## Effect on CMS-NAB-08 (reconciliation report)

The report is read-only and must not fabricate. It will:

- compare the CMS tenant projection with Control Plane tenant state through an injected reader. With no workload credential the
  reader is unavailable and the affected checks report BLOCKED, not "ok";
- check that the tenant resolves exactly one PRIMARY Organisation and never derive it from a legal entity;
- report legal-actor responsibility as optional and per-operation, and say plainly when none is established;
- report evidence standing (claimed, evidenced, verified by a Control Plane case) separately from admission, entitlement and
  capability binding, using the EVIDENCED / DECLARED / PLANNED / UNVERIFIED / BLOCKED vocabulary;
- show capability activation only from a Control Plane resolution, otherwise "no binding observed";
- list the upstream dependencies it cannot clear itself: NBO-01 merge, a staff-created admission, a verification case for the
  Nabhold claims, tenant provisioning, an IAM-issued workload identity, and the Shared `organisation_id` amendment.

## Decision requested before building the Organisation projection

Add a nullable `controlPlaneOrganisationId` to the CMS `organisations` collection now (additive migration, never invented, filled
only from a Control Plane issuance, like `controlPlaneTenantId`)? It is low risk and lets the report check the PRIMARY
Organisation mapping. The alternative is to wait for 027 acceptance and report that check as BLOCKED.


## Status update, 2026-10-09 (after Shared LA-01 and Control Plane LA-02/LA-03 merged)

Both ADRs now read **Accepted**. Shared LA-01 (`shared#256`, `5930dcf`), CP LA-02 (`baobab-cp#293`) and CP LA-03 (`baobab-cp#294`)
are merged. This section replaces the earlier "if accepted" framing; the sections above are kept as the record of that review.

**Done in the CMS since:**
- `controlPlaneOrganisationId` is now validated as a UUID (Shared `organisation/v2` `organisationId`) in the collection and in the
  onboarding planner. It is still filled only from a Control Plane issuance and never overwritten.
- The Control Plane context validator carries an optional `organisation_id` and rejects a malformed one.
- The provider declaration's Shared source revision is `5930dcf`; it validates with Shared's `validate-declaration`, and the
  `content` and `capabilities` contracts did not change between the old and new revisions.

**Still not available, so still not done (recorded in `nabhold-upstream-dependencies.json`):**
- Shared has no `organisation_id` on `content/v1` resolution and no v2 tenant read model. The CMS does not change contracts locally.
- The CP v2 routes are disabled by default and not enabled in any environment. No Nabhold tenant has been provisioned.
- The CP LA-03 runbook says v1 context consumers still require a default LegalEntity and fail closed for defaultless v2 tenants
  (LA-05). The resolve route's context validation is such a consumer, so a defaultless tenant would not resolve yet. This is
  disclosed, not worked around.
- Legal-actor mandates (LA-04) and the founding sponsorship and 12-month deferral runtime (PEO-02) are not implemented in CP.
  Shared defines the sponsorship and deferral records; CP code for them was not found.
- Decision recorded earlier as requested is now settled by the accepted ADR: the nullable `controlPlaneOrganisationId` stays.


## Status update, 10 October 2026

- **Grace is now 24 calendar months, not 12.** ADR-BCP-026 was amended (`baobab-cp#304`), Shared `shared#263` and the Control Plane pin `#305` followed. Any earlier statement here or in the CMS records that implied 12 months is superseded. The runtime is still not implemented.
- **LA-04A to LA-04D are merged** (mandate proposal, decision, activation, revocation): staging only, hard-disabled in production, no real mandate exists.
- **LA-05A, LA-05G, LA-05H are merged** (legal-actor assessment and staging assessor identities). They concern Trade, ERP, Payments and Trade Docs, not the content route.
- **Context validation:** the handler on `main` returns `organisation_id` for a RUNTIME context and states no default LegalEntity requirement, which fits the optional `organisation_id` the CMS now reads. Context issuance for a tenant with no default LegalEntity is not verified.
