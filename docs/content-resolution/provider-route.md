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
5. The Control Plane validates the context for the actual caller (`POST /v1/platform-context/validate`, caller token as `subject_token`). An optional `organisation_id` in the answer is carried through when it is a UUID and rejects the context when malformed (ADR-BCP-027). On `main` (checked 10 October 2026) the validate handler returns `organisation_id` and `market_id` for a RUNTIME context and states no default LegalEntity requirement. **Not verified:** whether the Control Plane can issue a RUNTIME context for a tenant with no default LegalEntity (the LA-03 runbook says v1 context consumers fail closed for such tenants until LA-05; LA-05 so far covers legal-actor assessment).
   Only a RUNTIME, unexpired context whose `context_id` and `tenant_id` are well formed counts. 4xx is 403 `CONTENT_CONTEXT_REJECTED`;
   5xx, 429, timeout or no validator token is 503 `CONTENT_CONTEXT_UNAVAILABLE` (retryable). Nothing is cached.
6. The body `tenant_id` must equal the validated tenant (same 403, same text as a rejected context). `preview_mode` needs `content:entry:preview`
   and the response is `no-store`.

## Configuration (all required; any missing gives 503 and nothing is served)

| Variable | Meaning |
|---|---|
| `CMS_TOKEN_ISSUER`, `CMS_TOKEN_AUDIENCE`, `CMS_TOKEN_JWKS_URL` | How callers' tokens are verified |
| `CONTROL_PLANE_URL` | Control Plane base URL |
| `CMS_CONTEXT_VALIDATOR_TOKEN` | Interim validator token holding `context:validate`. Replace with the workload token client when IAM provides it. Never log. |

## Data

Resolvable keys: `home` (pages) and `navigation`, `footer`, `site-settings`, `group-profile` (site-configurations), all `OVERRIDE`.
Records are tied to a Control Plane tenant through `tenants.controlPlaneTenantId` (set by the onboarding script from a Control Plane
issuance, never invented). An unmapped tenant resolves to `NONE`. A record narrows only to the scope it declares, so a
`DIGITAL_ESTATE` record is matched by a request carrying the legal entity and estate plus locale.

## Not done

Locale fallback chains are not configured (a request for `en` does not find `en-ZA`), `COMPOSE` is unsupported (422), list-style content
(portfolio, sectors, insights) has no resolve keys yet, and no live Control Plane or IdP exchange has been tested.
