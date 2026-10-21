# Development estate profiles

The existing Nabhold onboarding CLI and DRAFT-only content CLI now delegate to
`onboardEstate` and `seedEstateContent`. Profile configuration supplies independent
tenant, organisation, market and estate selectors, market geography/currency,
locale and content. Corporate ownership never confers cross-tenant access.
Nabhold retains its ZA/ZAR profile, no domains by default, explicit local mode,
production refusal and unchanged draft starter copy. No production onboarding or
IAM admission is added.

`syntheticEstateProfile(runId, references?)` selects a fixed `int03-<16 hex>`
namespace and complete public institutional home, navigation and footer fixtures,
plus draft settings/group profile. Its profile and nested fixtures are frozen;
altered/extended profile objects are refused by every synthetic operation. It
creates no human, workload user, credential, domain, grant or subsidiary.

Canonical references default explicitly to `UNRESOLVED` in the profile and
non-authoritative tenant provenance. Payload relationship IDs are local database
keys, not CP issuance. Unresolved references are omitted from CP identity fields.
CP-owned organisation/legal-actor, market and estate fields no longer generate
UUIDs locally. CMS-owned content identity issuance is unchanged. A future runtime
must supply identifiers from actual CP issuance and prove them with actual
current same-principal context; copying a supplied UUID is not an issuance proof.
A reference already owned by another local namespace blocks before any write.
Existing nonblank IDs are never replaced. Market/estate reference reconciliation
requires fresh disposable provisioning rather than repairing a mismatch.

The shared seeder queries by tenant, estate, locale, content key and kind, then
checks tenant/organisation/market/estate ownership again before accepting any
record. Duplicate or wrong-owner records block; existing editor content is never
updated. The synthetic controller verifies the complete set before explicitly
publishing, withdrawing or restoring drafts through the supplied CMS repository
port. Its receipt says `CMS_OWNED_DISPOSABLE_FIXTURE`, human editorial approval
false, and connected qualification false. This is trusted local fixture code,
not an HTTP route or a new authorisation mechanism. A Payload adapter must use
the existing explicit system context and still run collection hooks.

The PostgreSQL 17 component job migrates a fresh disposable database, seeds
Nabhold alongside the synthetic profile, exercises actual Payload publication,
withdrawal and draft hooks, and proves Nabhold rows unchanged. A second process
verifies persistence and unresolved CP fields. Unit tests cover namespace and
canonical-reference collisions, duplicates, tenant/organisation ownership,
locale/estate scoping, malformed adapters and production/local-mode refusal.
These are source/component checks only. Complete resource cleanup belongs to the
isolated database/container owner: the component CI service is destroyed, and
the dedicated INT-03 provider must destroy its storage on every exit, including
outbox/audit/version rows. There is deliberately no general-purpose shared-tenant
purge or audit-retention bypass.

The Shared registry activation hold is unchanged. Real IAM/CP/CMS connected
qualification, all fourteen NAB-03 cases, full INT-03, protected native IAM–CP,
executive authority, staging, production and R0–R3 remain open.
