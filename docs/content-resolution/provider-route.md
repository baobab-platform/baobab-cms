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
