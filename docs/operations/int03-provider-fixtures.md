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
a second isolated database and exercises all seven seed/verify/state calls.
This does not add host ports to the Infrastructure provider.

It requires actual PostgreSQL 17 and committed migrations. Seed is idempotent;
other actions verify the entire owned profile/content first. Publication state
changes use the frozen fixture comparison, never human editorial approval.
Every returned record's delivery projection is compared with the fixed seed.
The bounded result reports explicit UNRESOLVED canonical references and false
identity/CP-issuance/connected/production claims. No account or credential is
created by this port. Infrastructure owns complete storage/container/key cleanup,
including versions/outbox/audit rows, on success, failure and interruption.

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
