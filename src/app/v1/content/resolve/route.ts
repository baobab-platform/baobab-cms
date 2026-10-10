import { randomUUID } from 'node:crypto';
import { getPayload } from 'payload';
import config from '../../../../../payload.config.js';
import { createCallerAuthenticator } from '../../../../baobab/content-resolution/caller-auth.js';
import { createControlPlaneContextValidator } from '../../../../baobab/content-resolution/control-plane-context.js';
import { createPayloadContentSource } from '../../../../baobab/content-resolution/payload-source.js';
import { handleContentResolveRoute, MAX_BODY_BYTES } from '../../../../baobab/content-resolution/route.js';

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
  const issuer = env('CMS_TOKEN_ISSUER');
  const audience = env('CMS_TOKEN_AUDIENCE');
  const jwksUrl = env('CMS_TOKEN_JWKS_URL');
  const controlPlane = env('CONTROL_PLANE_URL');
  const validatorToken = env('CMS_CONTEXT_VALIDATOR_TOKEN');

  if (!issuer || !audience || !jwksUrl || !controlPlane || !validatorToken) {
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
  const authenticate = createCallerAuthenticator({ issuer, audience, jwksUrl });
  const validate = createControlPlaneContextValidator({
    baseUrl: controlPlane,
    // Interim: a token supplied by the platform. Replace with the workload token client when IAM provides it.
    tokens: { getToken: async () => validatorToken },
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
      validateContext: validate,
      content: createPayloadContentSource(payload as never),
      newCorrelationId: randomUUID,
    },
  );
  return new Response(JSON.stringify(result.body), { status: result.status, headers: result.headers });
}
