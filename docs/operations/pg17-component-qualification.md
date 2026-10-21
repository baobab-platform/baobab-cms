# PostgreSQL 17 and corporate-content component qualification

This increment implements a dependency of actual CMS qualification under Accepted
EA v2.3, ADR-SHARED-041 and Nabhold Go-Live v2.0 G05. It does not activate an IAM
registry row, a provider declaration, a binding, staging, production or R0–R3.
Shared #354 remains Accepted; the explicit registry activation hold still applies.

## Executable component checks

CI starts the digest-pinned official PostgreSQL 17 image, applies all committed
migrations to an empty `cms_pg17_qualification` database, and runs
`scripts/qualification/pg17-content.ts apply` followed by `verify` in a separate
Payload process. Database schema auto-push is disabled: missing migration DDL
must fail rather than be silently repaired at application startup.

The checks exercise real Payload and PostgreSQL: actual server major version;
onboarding local projections; five draft corporate-content records; idempotent
re-seeding with unchanged IDs; persistent re-read from a separate process;
role-less publish/archive/delete refusal; unrelated-tenant filtering; and
unchanged draft state/timestamp after denied writes. Local synthetic actors and
system seeding are intentional component fixtures, not authenticated Principals.
No content is published and no legal or commercial fact is asserted.

The command refuses every environment except explicit `ci` plus
`CMS_PG17_COMPONENT_QUALIFICATION=synthetic-disposable`, loopback PostgreSQL,
the exact disposable database name, and no object-store or SSO integration.
Do not run it against a shared, staging or production database. It prints only a
closed component result with live-IAM/CP, provider qualification, full INT-03 and
production claims all false. CI owns service teardown. No positive mocked CP
response is substituted for authority.

## Editorial contract step

All page mutations now require explicit editorial roles, just like corporate
singletons. The legacy role-less bypass and its configuration switch are
removed. No data migration auto-assigns roles, capabilities or publishing
rights. Existing role-less editors will be denied until their roles are reviewed
and projected by the owning identity workflow. System seeding retains its
explicit platform actor. Product-content REVIEW workflow, maker/checker/legal
approval and live IAM editorial admission remain separate pending work.

## Existing development databases

Compose now uses a separate `postgres17_data` volume. The former `postgres_data`
volume is not mounted into PostgreSQL 17 and is not automatically deleted or
upgraded. PostgreSQL major versions cannot reuse the same data directory.

For an existing development installation, stop writers, take and independently
verify a logical backup using the old server, and restore it into a separate
PostgreSQL 17 instance. Apply reviewed migrations, reconcile content/row counts,
validate access and outbox state, and retain the old volume for rollback. Do not
run `docker compose down --volumes` as a migration or delete old data to fix a
version error. A fresh installation runs `npm run db:migrate` before starting
Payload; automatic development DDL push is no longer enabled.

The multi-platform image manifest body was downloaded from Docker's official
registry and its SHA-256 checked against `Docker-Content-Digest`. This is not a
rehash of the earlier identity-run artifact, whose digest remains GitHub-reported.

## Remaining critical path

Actual CMS qualification still requires authorised canonical caller/validator
rows, IAM-owned ephemeral provisioning and service-account read-back, issuance
and shutdown deadlines, current same-principal CP context, real Node 24 CMS/PG17,
independent provider certification and current release/health/binding, all
normative INT-03/L4 negatives, and unconditional teardown. Preserve PARTIAL
support and non-trading Nabhold. Protected native IAM↔CP, executive mandates,
actual AWS staging, production sign-offs and R0–R3 remain open independently.
