# Nabhold Control Plane reconciliation report

Gate CMS-NAB-08. Status: implemented in code and run against PostgreSQL 16, empty and seeded. Not production-activated.

`npx tsx scripts/reconcile/nabhold-cp.ts [--format text] [--strict]` reads the CMS and, if configured, the Control Plane. It changes
nothing. `--strict` exits 1 when any finding is BLOCKED. Optional `CONTROL_PLANE_URL` and `CMS_CP_READ_TOKEN` let it read the tenant;
without them those checks say so rather than guessing. No secret is printed.

## Vocabulary

EVIDENCED observed directly (a local fact, or a Control Plane answer received now). DECLARED stated by a CMS record, not confirmed by the
authority. PLANNED intended, nothing in place. UNVERIFIED the means to check are missing. BLOCKED something known stops progress.

## What it checks and why (ADR-BCP-026 and ADR-BCP-027, treated as accepted by sponsor instruction)

| Finding | Rule |
|---|---|
| CMS tenant projection | Local, non-authoritative. |
| Control Plane tenant id | Unset is BLOCKED. Set is confirmed only by a Control Plane answer showing the tenant active; a different id, a missing tenant or a non-active state is BLOCKED; an unreachable Control Plane is UNVERIFIED. |
| PRIMARY Organisation | Held as `controlPlaneOrganisationId`, never derived from the legal entity. Cannot be confirmed until the Shared tenant read model exposes it (ADR-BCP-027 LA-01). |
| Legal-actor reference | Optional, per operation, not a mandate; a Control Plane projection that names a different legal entity is BLOCKED. |
| Legal-person verification | Always UNVERIFIED here: the CMS holds no registration facts and no verification case was observed. |
| Market, domains | ZA and ZAR only; a hostname is never assumed approved. |
| Provider declaration | PARTIAL declaration is repository evidence, not binding, grant or health. |
| Capability binding | UNVERIFIED: the report cannot read or create a binding. `activationObserved` is always false. |
| Route configuration | Setting names only, never values. |
| Content, outbox, service identities, editor sign-in | Counted from the database; dead letters and over-privileged identities are BLOCKED. |
| Upstream | Copied from `docs/operations/nabhold-upstream-dependencies.json`, each with its date and evidence; not re-observed. |

## Keeping it honest

The upstream file is a hand-kept record. Update it with the evidence when something changes. Nothing in the report can be turned green by
editing the CMS: confirmation comes only from a Control Plane answer.

## Not covered

Reading capability bindings, grants and verification cases from the Control Plane (no authorised read path yet), comparing markets and
estates with Control Plane records, and scheduled runs or alerting.
