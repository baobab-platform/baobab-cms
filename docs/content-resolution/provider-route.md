# `content.entry.resolve` provider route

Route: `POST /v1/content/resolve?context_id=<uuid>` (Shared `contracts/content/v1/openapi.yaml`, merged in Shared #254).
Code: `src/app/v1/content/resolve/route.ts` wiring `src/baobab/content-resolution/{route,caller-auth,control-plane-context,payload-source}.ts`.
Status: **implemented in code, not activated.** `.baobab/capability-provider.yaml` declares PARTIAL support (repository evidence only; it validates
against Shared's declaration schema). No Control Plane binding, grant or certification exists, and the route has not been exercised against a live
Control Plane or identity provider.

## Pipeline (each step fails closed)

1. Bearer token verified against the issuer's JWKS (asymmetric algorithms only; issuer, audience, expiry, `jti`, `actor_type=workload`, scope claim). Else 401.
2. Scope `content:entry:resolve` required. Else 403 `CONTENT_CONTEXT_REJECTED`.
3. `context_id` must be a UUID. Else 400.
4. Body: JSON, at most 8 KiB. Else 400.
5. The Control Plane validates the context for the actual caller (`POST /v1/platform-context/validate`, caller token as `subject_token`). A mandatory `organisation_id` must attest PRIMARY Organisation as a UUID; absence or malformed identity rejects the context (ADR-BCP-027). On `main` (checked 10 October 2026) the validate handler returns `organisation_id` and `market_id` for a RUNTIME context and states no default LegalEntity requirement. **Not verified:** whether the Control Plane can issue a RUNTIME context for a tenant with no default LegalEntity (the LA-03 runbook says v1 context consumers fail closed for such tenants until LA-05; LA-05 so far covers legal-actor assessment).
   Only a RUNTIME, unexpired context whose `context_id` and `tenant_id` are well formed counts. 4xx is 403 `CONTENT_CONTEXT_REJECTED`;
   5xx, 429, timeout or no validator token is 503 `CONTENT_CONTEXT_UNAVAILABLE` (retryable). Nothing is cached.
6. Exactly one active Tenant and one active Organisation projection must match the CP-attested identity pair before content is read. Missing, duplicate, inactive or mismatched projections reject the context; a database failure returns retryable 503.
7. The body `tenant_id` must equal the validated tenant (same 403, same text as a rejected context). `preview_mode` needs `content:entry:preview`
   and the response is `no-store`.

## Configuration (all required; any missing gives 503 and nothing is served)

| Variable | Meaning |
|---|---|
| `CMS_TOKEN_ISSUER`, `CMS_TOKEN_AUDIENCE`, `CMS_TOKEN_JWKS_URL` | How callers' tokens are verified |
| `CONTROL_PLANE_URL` | Control Plane origin only, without a path or `/v1` (the validator appends `/v1/platform-context/validate`) |
| `CMS_CONTEXT_VALIDATOR_TOKEN` | Interim validator token holding `context:validate`. Shared's workload registry now allocates `context:validate` (with `validates_audiences: [baobab-cms]`) to `baobab-cms-workload` (shared#265, `c45ae13`), but that is a registry ceiling only: baobab-iam does not yet issue the credential. Replace this with a workload-token client once IAM does. Never log. |

## Data

Resolvable keys: `home` (pages) and `navigation`, `footer`, `site-settings`, `group-profile` (site-configurations), all `OVERRIDE`.
Records are tied to a Control Plane tenant through `tenants.controlPlaneTenantId` (set by the onboarding script from a Control Plane
issuance, never invented). An unmapped tenant is rejected at the projection check; the lower-level content source remains empty for unmapped tenants. A record narrows only to the scope it declares, so a
`DIGITAL_ESTATE` record is matched by estate and locale without requiring a LegalEntity filter.

## Not done

Locale fallback chains are not configured (a request for `en` does not find `en-ZA`), `COMPOSE` is unsupported (422), list-style content
(portfolio, sectors, insights) has no resolve keys yet, and no live Control Plane or IdP exchange has been tested.

## Organisation-first context convergence — Nabhold v2.0 G05 / P0-02

The provider now requires `organisation_id` in CP's RUNTIME validation response,
as specified by accepted ADR-BCP-027 and Shared platform-context v2. Missing,
malformed, expired or provisioning context is rejected. Redirects are refused
when sending validator/subject tokens; validation responses are never cached.

Before reading content with `overrideAccess`, the route compares the validated
Tenant and PRIMARY Organisation against exactly one active local Tenant and one
active Organisation projection in that Tenant. Missing, duplicate, inactive or
mismatched projections return the existing generic context-rejected response;
database failure returns retryable unavailability. Projection consistency grants
no authority and cannot replace the authenticated CP decision.

Shared content v1 remains unchanged: no `organisation_id` field is accepted in
the request body, and its optional `legal_entity_id` remains only a content
filter. No LegalEntity is required by the new identity check. Existing fields
and migrations already carry `controlPlaneOrganisationId`; no schema migration
or backfill from company names/LegalEntity values is introduced.

Compatibility: old CP validation responses without PRIMARY Organisation now
fail closed. Upgrade/qualify CP and reconcile projections before deploying this
provider route. This follows the accepted platform authority model; it does not
accept Proposed ADR-0021 or certify a production binding. Real workload identity,
independent Nabhold onboarding, protected E2E and operational acceptance remain
external requirements. CMS provider support remains PARTIAL.

Projection UUID lookup finds case-insensitive candidates and then requires exact
case-insensitive equality against the returned `controlPlaneOrganisationId`.
Payload LIKE candidate matching must not itself establish identity: malformed
stored text containing the UUID as a substring is rejected. UUID syntax is
validated before querying, so caller `%`/`_` patterns are also refused. Existing
mixed-case text projections work without a migration; duplicates fail closed.

## Signed workload scope convergence — protected R0 preparation

The JWT authenticator accepts Shared's hierarchical scope-key grammar, including
`content:entry:resolve` and `content:entry:preview`. Previously its one-colon
regular expression rejected correctly issued CMS credentials before the route
could enforce them. Space-delimited keys are checked individually; empty keys,
wildcards, malformed segments and trailing line terminators remain refused.

Shared workload-token v1 at `892d09c64ca6490c46c2f54c37bd366fcc36c3e5` and IAM
#114 define the consulted syntax. This is a compatible lexical correction, not
a registry allocation or provider activation. The existing issuer, asymmetric
signature, audience, expiry, workload actor and required-claim checks remain.
The route still requires exact scopes and authenticated CP context/projection
validation. Signed ES256 tokens verified through a real local JWKS service test
those fences and the route's denial behaviour. Protected acceptance remains
pending; no live token, grant, binding or certification is created by this fix.

## Disposable INT-03 development validator

The explicit `CMS_CONTEXT_VALIDATOR_MODE=development-proof` profile uses
maintained `openid-client` client-credentials acquisition and fresh trusted
introspection on every context validation. It is restricted to the separately
accepted `baobab-int03-cms-validator`, environment `development`, CP audience and
`context:validate` only. It never acquires `context:resolve`, content, preview or
administration permissions, and is not the Nabhold caller. CP still validates
the caller's actual token and current same-Principal context independently.

Token acquisition and introspection use `client_secret_post`, matching IAM's
maintained Hydra WorkloadProvisioner (`internal/provider/ory/hydra.go`). The
exact validator's independent credentials appear once in the bounded HTTPS
request body, never in a URL or an additional Basic header. No method fallback
or substitute client is selected. Protocol tests exercise the maintained OAuth
library's wire contract, not actual IAM issuance or connected qualification.

Required server-only inputs are `CMS_WORKLOAD_ENVIRONMENT=development`,
`CMS_WORKLOAD_CLIENT_ID=baobab-int03-cms-validator`, a distinct per-run
`CMS_WORKLOAD_CLIENT_SECRET` of at least 32 characters, reviewed HTTPS
`CMS_WORKLOAD_TOKEN_ENDPOINT` and `CMS_WORKLOAD_INTROSPECTION_ENDPOINT` on
`CMS_TOKEN_ISSUER`'s origin, and a fixed absolute ISO `CMS_PROOF_DEADLINE`.
`CMS_TOKEN_AUDIENCE` must remain `baobab-cms`. Retain the existing verified JWKS,
CP URL, projection and content-provider configuration. The deadline is set by
the disposable orchestrator at client creation and must never roll forward.

Tokens are at most five minutes, bounded to the remaining run window (maximum
90 minutes), with no refresh/ID token or positive revocation cache. OAuth
responses have a 64 KiB decoded-byte ceiling and five-second deadline. No
redirect, insecure TLS, foreign credential endpoint or expanded/swapped token
identity is accepted. Failures are bounded and contain no credentials or peer
response. An unknown/invalid explicit mode fails 503 before Payload startup;
it cannot fall back to `CMS_CONTEXT_VALIDATOR_TOKEN`. Supplying that fixed token
alongside proof configuration is also refused. Outside proof mode the existing
explicit validator-token input is unchanged.

This is source preparation, not a registry activation, IAM provisioning,
EngineRelease, certification, health, binding or provider qualification. The
orchestrator must consume the approved canonical registry, independently create
and read back both ephemeral identities, enforce early-close revocation or
destroy all issuer trust/accepting runtimes, and always tear down. PARTIAL /
non-production support remains unchanged. Actual CMS/PostgreSQL and complete
NAB/L4 acceptance, protected IAM/CP, executive authority, staging, production
and R0–R3 remain open. Protocol tests do not replace those gates.

## DEV-05 current native capability enforcement

The normal provider route now requires a fresh CP `content.entry.resolve@1`
resolution after caller/context validation and before local projection/content
reads. Configure the CP-issued wire identifiers `CMS_CAPABILITY_PROVIDER_ID`
(`provider_...`) and `CMS_ENGINE_INSTANCE_ID` (`ei_...`) on the server. Missing or
malformed configuration fails 503; there is no development bypass or default
binding. The invocation must identify that exact provider/instance, contract and
logical service `service://baobab-cms/content`. Grant, binding, resolution,
context, correlation and expiry provenance are checked on every resource call.
No positive grant or binding decision is cached.

The caller's token needs both existing registry-allocated audiences
`baobab-control-plane` and `baobab-cms`, with `context:resolve` and
`content:entry:resolve`. The independent CMS validator keeps only
`context:validate`; it never borrows the caller's entitlement. Caller scopes and
current context do not substitute for the capability grant. Revoked grants,
missing subscriptions, retired bindings and wrong provider/instance fail closed.
Transport/authority failure is retryable 503; unusable authority is generic 403.
Bounded HTTPS reads reject redirects, unsafe configured origins, oversized or
malformed decisions, expired provenance and disabled TLS verification.

A successful native content response must first persist `content.entry.resolve`
in the existing immutable `audit-logs` collection. The audit joins the actual
record identity and CP context/resolution/grant/binding/provider/instance tuple;
it stores no bearer or content body. Failure to persist returns 503 without
content. This strict read path deliberately does not use the best-effort
editorial audit helper. Denied authority cannot reach projection/content reads
or create an allowed-read audit. No new database schema or migration is needed.

The declaration's COMPLETE support is source implementation evidence, not
activation or certification. Historical PARTIAL notes above describe earlier
increments. Native IAM/CP/PG/BFF acceptance remains the fourteen-case Infrastructure
NAB-03 qualifier at its recorded source pins, with independent audit read-back and
issuer/host cleanup. Protected and production acceptance remain separate.

## Exact Market qualification fixture

A disposable synthetic profile supplied with a real CP Market now creates
MARKET-scoped records. Native delivery therefore includes that canonical Market
and resolves the estate's complete selector as EXACT. An estate-wide record is
not equivalent: the BFF correctly refuses fallback when a Market was selected.
Profiles with unresolved Market references retain their former DIGITAL_ESTATE
scope, and ordinary Nabhold starter content remains DRAFT and estate scoped.
Publication verifies the expected scope and refuses broadened or edited rows;
existing rows are never silently rewritten. Fresh connected evidence is required
after changing the owner source pin. This carries content-selection scope only,
not legal, commercial, provider certification or production authority.
