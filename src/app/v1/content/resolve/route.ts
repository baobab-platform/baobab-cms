import { developmentCallerStatus } from '../../../../baobab/identity/development-caller-status.js';
import { randomUUID } from 'node:crypto';
import { createContentCapabilityAuthority } from '../../../../baobab/content-resolution/capability-authority.js';
import { getPayload } from 'payload';
import config from '../../../../../payload.config.js';
import { createCallerAuthenticator } from '../../../../baobab/content-resolution/caller-auth.js';
import { createControlPlaneContextValidator } from '../../../../baobab/content-resolution/control-plane-context.js';
import { createPayloadContentSource, createPayloadProjectionValidator } from '../../../../baobab/content-resolution/payload-source.js';
import { handleContentResolveRoute, MAX_BODY_BYTES, missingBearerResponse } from '../../../../baobab/content-resolution/route.js';
import { createDevelopmentValidatorTokens } from '../../../../baobab/identity/development-validator.js';
import type { ValidatorTokenProvider } from '../../../../baobab/content-resolution/control-plane-context.js';

/**
 * POST /v1/content/resolve, the provider route for content.entry.resolve
 * (route_reference /v1/content/resolve).
 *
 * Fails closed when not configured: without issuer, audience, JWKS, Control
 * Plane URL and a validator token source, every call is refused. Nothing here
 * activates the capability in the Control Plane; that is a separate binding.
 */
export const dynamic = 'force-dynamic';

const env = (name: string): string | undefined => process.env[name] || undefined;

export async function POST(request: Request): Promise<Response> {
  const unauthenticated = missingBearerResponse({ authorization: request.headers.get('authorization'),
    correlationId: request.headers.get('x-correlation-id'), traceparent: request.headers.get('traceparent') }, randomUUID);
  if (unauthenticated) return new Response(JSON.stringify(unauthenticated.body), { status: unauthenticated.status, headers: unauthenticated.headers });

  const issuer = env('CMS_TOKEN_ISSUER');
  const audience = env('CMS_TOKEN_AUDIENCE');
  const jwksUrl = env('CMS_TOKEN_JWKS_URL');
  const controlPlane = env('CONTROL_PLANE_URL');
  const validatorToken = env('CMS_CONTEXT_VALIDATOR_TOKEN');
  let tokens: ValidatorTokenProvider | undefined;
  let currentStatus: ReturnType<typeof developmentCallerStatus> | undefined;
  let resolveCapability: ReturnType<typeof createContentCapabilityAuthority> | undefined;
  try {
    // An explicitly requested proof profile must never fall back to a product
    // token if its independent development credential/deadline is invalid.
    tokens = process.env.CMS_CONTEXT_VALIDATOR_MODE !== undefined
      ? createDevelopmentValidatorTokens()
      : validatorToken ? { getToken: async () => validatorToken } : undefined;
    if (process.env.CMS_CONTEXT_VALIDATOR_MODE !== undefined) currentStatus = developmentCallerStatus();
    resolveCapability = createContentCapabilityAuthority({ baseUrl: controlPlane ?? '',
      providerId: env('CMS_CAPABILITY_PROVIDER_ID') ?? '', engineInstanceId: env('CMS_ENGINE_INSTANCE_ID') ?? '' });
  } catch { tokens = undefined; }

  if (!issuer || !audience || !jwksUrl || !controlPlane || !tokens || !resolveCapability) {
    return Response.json(
      { code: 'CONTENT_CONTEXT_UNAVAILABLE', title: 'Not configured', status: 503, retryable: true },
      { status: 503, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } },
    );
  }

  const declared = Number(request.headers.get('content-length') ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return Response.json(
      { code: 'CONTENT_REQUEST_INVALID', title: 'Invalid request', status: 400, retryable: false },
      { status: 400, headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' } },
    );
  }

  const payload = await getPayload({ config });
  const authenticate = createCallerAuthenticator({ issuer, audience, jwksUrl, currentStatus });
  const validate = createControlPlaneContextValidator({
    baseUrl: controlPlane,
    // A proof run uses its own current, independently scoped development
    // validator. The existing explicit token input is kept outside that mode.
    tokens,
  });

  const url = new URL(request.url);
  const result = await handleContentResolveRoute(
    {
      authorization: request.headers.get('authorization'),
      correlationId: request.headers.get('x-correlation-id'),
      traceparent: request.headers.get('traceparent'),
      contextId: url.searchParams.get('context_id'),
      bodyText: await request.text(),
    },
    {
      authenticate,
      resolveCapability,
      // Audit persistence is mandatory before returning content. Only canonical
      // references and record identity are stored, never bearer or content data.
      recordRead: async input => { await payload.create({ collection: 'audit-logs', overrideAccess: true,
        data: { actorId: input.subject, tenant: input.tenantId, resourceType: 'content.entry',
          resourceId: input.recordId ?? input.contentKey, action: 'content.entry.resolve', outcome: 'ALLOWED',
          correlationId: input.correlationId, resultingState: { context_id: input.contextId,
            resolution_id: input.authority.resolutionId, grant_id: input.authority.grantId,
            binding_id: input.authority.bindingId, provider_id: input.authority.providerId,
            engine_instance_id: input.authority.engineInstanceId, content_key: input.contentKey, record_id: input.recordId } } }); },
      validateContext: validate,
      validateProjection: createPayloadProjectionValidator(payload as never),
      content: createPayloadContentSource(payload as never),
      newCorrelationId: randomUUID,
    },
  );
  return new Response(JSON.stringify(result.body), { status: result.status, headers: result.headers });
}
