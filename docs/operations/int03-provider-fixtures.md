# Disposable INT-03 provider fixture port

Infrastructure's CMS component provider uses the actual production Dockerfile,
its source-built `build` stage for explicit migrations/fixture operations, and
its unprivileged standalone `runtime` stage for HTTP. The Node 24.21.0 Alpine
base is pinned to the official OCI index digest; its response body was downloaded
and independently SHA-256 checked against Docker's content-digest header. npm
uses the approved committed package lock. This does not independently rehash the
earlier identity-smoke GitHub artifact.

The existing Payload `ContentSeedRepository` now has one reusable local adapter.
It declares the existing system context, runs collection/outbox hooks and exposes
no network API or persisted actor. The PostgreSQL component check and disposable
fixture CLI share it. Nabhold's public draft seeder and authentication stay separate.

Invoke `node --import tsx scripts/qualification/int03-fixture.ts ACTION` inside
the controlled build-stage container. Actions are `seed`, `verify`, `publish`,
`withdraw`, `draft`. Before loading application config or connecting to a database,
the CLI requires all of:

- `BAOBAB_ENVIRONMENT=ci`, `CMS_INT03_FIXTURE=synthetic-disposable`;
- `CMS_INT03_RUN_ID` containing exactly sixteen lowercase hex digits;
- a non-default `PAYLOAD_SECRET` of at least 32 characters;
- a credentialed PostgreSQL URL with hostname `cms-db`, port 5432 (or implicit),
  database `cms_int03_<run id>` and no URL query or fragment;
- no IAM human-SSO issuer, external S3 endpoint or S3 bucket.

For source regression only, the existing GitHub PG17 component job may use
loopback with both `GITHUB_ACTIONS=true` and its existing explicit
`CMS_PG17_COMPONENT_QUALIFICATION=synthetic-disposable` flag. That job creates
a second isolated database and exercises the seed/verify/state lifecycle plus
an explicit unresolved-reference handoff verification.
This does not add host ports to the Infrastructure provider.

It requires actual PostgreSQL 17 and committed migrations. Seed is idempotent;
other actions verify the entire owned profile/content first. Publication state
changes use the frozen fixture comparison, never human editorial approval.
Every returned record's delivery projection is compared with the fixed seed.
The bounded result defaults to explicit UNRESOLVED canonical references and false
identity/CP-issuance/connected/production claims. No account or credential is
created by this port. Infrastructure owns complete storage/container/key cleanup,
including versions/outbox/audit rows, on success, failure and interruption.

## Run-bound CP reference handoff

The later connected runner may supply `CMS_INT03_REFERENCE_DECLARATION` before
every fixture action. This is a bounded configuration input, not a registration
API or an assertion that CP issuance has been verified. Serialize one JSON object
with `JSON.stringify` (no interior whitespace or duplicate keys), containing
exactly `schema: "cms.int03.reference-declaration.v1"`, `run_id` matching the
database/profile run and `references`. The references object must contain exactly
`tenant`, `organisation`, `legalEntity`, `market` and `digitalEstate`. All five
must be `UNRESOLVED`, or all must be supplied in their maintained CP identifier
formats. Mixed, stale-run, oversized, unknown-field or malformed declarations
refuse before loading config or touching the database.

In ADR-SHARED-043's disposable CP bootstrap only, `legalEntity` may be
the exact `DEV-<first twelve run-hex>-NABHOLD` synthetic unverified legal
actor. Wrong-run, wrong-actor, alternate case and embellished markers refuse.
This marker is never treated as a verified registration or production legal
identity; ordinary UUIDs retain their original meaning.

The connected runner must obtain supplied identifiers from actual CP issuance
and read back their current tenant/owner/estate relationships independently.
Never generate identifiers to populate this input or copy Nabhold/subsidiary
references into a synthetic profile. Existing profile reconciliation refuses
canonical aliases, changed references or a conflicting local ownership graph.
Use a fresh disposable database/profile for the resolved run; a held component
database is not promoted to a connected qualification environment.

The result labels supplied values `EXTERNAL_DECLARATION_NOT_VERIFIED` and always
keeps `cp_issuance_proven`, human approval, connected qualification and production
authorization false. Omission/all-UNRESOLVED values retain `reference_source:
UNRESOLVED`. Unit identifier vectors validate parsing only and are never persisted
as issued CP identities. The actual PG regression uses only UNRESOLVED references.

The canonical content route now returns the existing 401 authentication problem
for absent or malformed bearer syntax before dependency/configuration setup.
This allows actual anonymous denial while the registry is held without inventing
a validator credential. A syntactically present token still needs the actual
configured IAM verifier and current same-principal CP path; an unconfigured path
continues to return 503. No token is accepted by the early syntax check.

These are component preparation ports, not connected qualification. The registry
activation hold, fourteen connected NAB-03 cases, full INT-03 and every protected
or production release gate remain outstanding. Once actual CP issuance and the
reviewed activation pins are available, the connected owner must supply and
independently prove current authority through the maintained IAM/CP/Nabhold ports;
the component fixture result cannot stand in for those receipts.

### DEV-05 current caller status

The named development-proof mode now also checks the inbound caller's current
issuer status after signature/issuer/audience/expiry verification. It uses the
CMS validator's own same-issuer credential and immutable proof deadline, with
bounded transport and no positive status cache. Inactive or rebound caller
claims deny authentication; status-reader failure returns retryable 503, never
an anonymous fallback or an accepted cached bearer. This complements CP's
independent subject-token status check. It does not create a grant, certify the
PARTIAL provider declaration or activate an estate binding. Existing deployments
outside this explicit mode retain their configured authentication profile.

### DEV-05 validator lifetime compatibility

Hydra's introspection `iat` corresponds to access-request time; JWT signing
may occur later, and `exp` has integer-second precision. Native qualification
observed intermittent mismatches between `exp` and the token endpoint's nominal
`expires_in`, despite positive issuer/subject/scope/audience checks. The
Infrastructure development validator client is now configured with an actual
55-second issuer ceiling. The CMS proof profile accepts only an independently
active token with integer, ordered `iat`/`exp`, issuer/subject/client/audience/
scope binding, and BOTH issuer-request-to-expiry and local-acquisition-to-expiry
within a hard **60-second maximum**. At most five seconds of timestamp
separation from the nominal 55-second issuance is tolerated, never extra
lifetime, missing status, a token extending beyond the immutable run deadline,
or an active bearer with mismatched current claims. No status is cached and
no entitlement, approval, product token or static validator fallback is created.
