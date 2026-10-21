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
The current CP Market Registry uses opaque `mkt_` identifiers, not UUIDs.
CP-owned organisation/legal-actor, market and estate fields no longer generate
UUIDs locally. CMS-owned content identity issuance is unchanged. A future runtime
must supply identifiers from actual CP issuance and prove them with actual
current same-principal context; copying a supplied UUID is not an issuance proof.
A reference already owned by another local namespace blocks before any write.
Existing nonblank IDs are never replaced. Market/estate reference reconciliation
requires fresh disposable provisioning rather than repairing a mismatch.

The shared seeder queries by tenant, estate, locale, content key and kind, then
checks active tenant/organisation/market/estate ownership again before accepting any
record. Duplicate or wrong-owner records block; existing editor content is never
updated. The synthetic controller verifies the complete set before explicitly
publishing, withdrawing or restoring drafts through the supplied CMS repository
port. Before changing state, it compares every record’s current delivery data
to the frozen seed using the actual CMS delivery projection, and refuses altered
copy, extra delivered fields, wider scope or effective-date/region changes.
Payload array-row IDs and empty optional defaults are the only ignored shape
differences. It never publishes editor amendments as fixture content. Its receipt says `CMS_OWNED_DISPOSABLE_FIXTURE`, human editorial approval
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

## INT-03 provider fixture CLI

`scripts/qualification/int03-provider-fixture.ts` is the CMS-owned entry point
that the Infrastructure INT-03 CMS provider runs from the image's `build`
stage (the stage that already owns `db:migrate`). The runtime image is
unchanged and still ships no scripts.

| Command | Effect |
| --- | --- |
| `apply` | fresh database only: Nabhold draft estate as the neighbour (without its local workload user), then the synthetic estate, seeded twice to prove idempotency, and published |
| `state published\|withdrawn\|draft` | `setSyntheticContentState`, proving every Nabhold page and site configuration row unchanged |
| `verify published\|withdrawn\|draft` | separate-process re-read: all five fixtures in that state, CP references still unresolved, Nabhold still draft-only |

`providerRun` (`src/baobab/onboarding/int03-provider-boundary.ts`) refuses
before Payload config loads unless `CMS_INT03_PROVIDER=synthetic-disposable`,
`BAOBAB_ENVIRONMENT=development`, `NODE_ENV` is not production, a 16-hex
`CMS_INT03_RUN_ID` names the database `cms_int03_<run id>`, the host is
loopback or a single-label container name, and no object store or SSO is
configured. Only fixed codes leave the process. The receipt says
`CMS_OWNED_DISPOSABLE_FIXTURE`, `human_editorial_approval: false` and
`connected_qualification: false`. It creates no principal, credential, grant
or domain. The provider owns teardown of the database.

The migration CI job runs the whole lifecycle on a second fresh database.
