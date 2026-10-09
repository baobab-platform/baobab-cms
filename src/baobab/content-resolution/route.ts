import {
  handleContentResolve,
  type ContentResolveDependencies,
  type ContentResolveOutcome,
  type ProblemDetails,
} from './contract.js';

/**
 * Transport pipeline for POST /v1/content/resolve (Shared contracts/content/v1/openapi.yaml).
 *
 * Order, each step failing closed:
 *  1. authenticate the caller (workload token) .......... 401
 *  2. require scope content:entry:resolve ................ 403 CONTENT_CONTEXT_REJECTED
 *  3. context_id present and a UUID ...................... 400 CONTENT_REQUEST_INVALID
 *  4. body is bounded JSON ............................... 400 CONTENT_REQUEST_INVALID
 *  5. Control Plane validates the context for this caller . 403 CONTENT_CONTEXT_REJECTED / 503
 *  6. handler: tenant claim vs validated tenant, preview scope, resolution.
 *
 * Tenant authority is only ever what the Control Plane returned in step 5.
 * The caller's token is passed to the Control Plane as subject evidence and is
 * never logged, echoed or stored here.
 */

export const SCOPE_RESOLVE = 'content:entry:resolve';
export const SCOPE_PREVIEW = 'content:entry:preview';
export const MAX_BODY_BYTES = 8 * 1024;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROBLEM_BASE = 'https://docs.baobab-platform.com/problems/';

export interface AuthenticatedCaller {
  scopes: ReadonlySet<string>;
}

export type ContextValidation =
  | { status: 'valid'; tenantId: string }
  | { status: 'rejected' }
  | { status: 'unavailable' };

export interface ContentRouteDependencies {
  /** Verifies the bearer token. Null means unauthenticated. */
  authenticate(bearerToken: string): Promise<AuthenticatedCaller | null>;
  /** Asks the Control Plane whether `contextId` belongs to the caller who presented `subjectToken`. */
  validateContext(input: {
    contextId: string;
    subjectToken: string;
    correlationId: string;
    traceparent?: string;
  }): Promise<ContextValidation>;
  content: ContentResolveDependencies;
  newCorrelationId(): string;
}

export interface RouteRequest {
  authorization?: string | null;
  correlationId?: string | null;
  traceparent?: string | null;
  contextId?: string | null;
  bodyText: string;
}

export interface RouteResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

const TRACEPARENT = /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/;

function problemResponse(
  correlationId: string,
  status: number,
  slug: string,
  code: string,
  title: string,
  detail: string,
  retryable = false,
  traceId?: string,
): RouteResponse {
  const body: ProblemDetails = {
    type: `${PROBLEM_BASE}${slug}`,
    title,
    status,
    detail,
    code,
    correlation_id: correlationId,
    ...(traceId ? { trace_id: traceId } : {}),
    retryable,
  };
  return {
    status,
    headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
    body,
  };
}

function fromOutcome(outcome: ContentResolveOutcome, preview: boolean): RouteResponse {
  if (outcome.ok) {
    return {
      status: 200,
      headers: { 'content-type': 'application/json', 'cache-control': preview ? 'no-store' : 'private' },
      body: outcome.body,
    };
  }
  return {
    status: outcome.status,
    headers: { 'content-type': 'application/problem+json', 'cache-control': 'no-store' },
    body: outcome.problem,
  };
}

export async function handleContentResolveRoute(
  request: RouteRequest,
  deps: ContentRouteDependencies,
): Promise<RouteResponse> {
  const correlationId =
    request.correlationId && UUID.test(request.correlationId) ? request.correlationId : deps.newCorrelationId();
  const traceparent = request.traceparent && TRACEPARENT.test(request.traceparent) ? request.traceparent : undefined;
  const traceId = traceparent?.split('-')[1];
  const fail = (status: number, slug: string, code: string, title: string, detail: string, retryable = false) =>
    problemResponse(correlationId, status, slug, code, title, detail, retryable, traceId);

  // 1. Authenticate.
  const match = /^Bearer ([A-Za-z0-9._~+/-]+=*)$/.exec(request.authorization ?? '');
  const token = match?.[1];
  const caller = token ? await deps.authenticate(token) : null;
  if (!token || !caller) {
    return fail(401, 'authentication-required', 'AUTHENTICATION_REQUIRED', 'Authentication required', 'A valid workload token is required.');
  }

  // 2. Scope.
  if (!caller.scopes.has(SCOPE_RESOLVE)) {
    return fail(403, 'content-context-rejected', 'CONTENT_CONTEXT_REJECTED', 'Context rejected', 'The request context cannot be used by this caller.');
  }

  // 3. Context id.
  if (!request.contextId || !UUID.test(request.contextId)) {
    return fail(400, 'invalid-request', 'CONTENT_REQUEST_INVALID', 'Invalid request', 'context_id is required and must be a UUID.');
  }

  // 4. Body.
  if (Buffer.byteLength(request.bodyText, 'utf8') > MAX_BODY_BYTES) {
    return fail(400, 'invalid-request', 'CONTENT_REQUEST_INVALID', 'Invalid request', 'The request body is too large.');
  }
  let body: unknown;
  try {
    body = JSON.parse(request.bodyText);
  } catch {
    return fail(400, 'invalid-request', 'CONTENT_REQUEST_INVALID', 'Invalid request', 'The request body is not valid JSON.');
  }

  // 5. Control Plane context.
  let validation: ContextValidation;
  try {
    validation = await deps.validateContext({
      contextId: request.contextId,
      subjectToken: token,
      correlationId,
      traceparent,
    });
  } catch {
    validation = { status: 'unavailable' };
  }
  if (validation.status === 'unavailable') {
    return fail(503, 'content-context-unavailable', 'CONTENT_CONTEXT_UNAVAILABLE', 'Context validation unavailable', 'The Control Plane could not be reached to validate the context.', true);
  }
  if (validation.status === 'rejected') {
    return fail(403, 'content-context-rejected', 'CONTENT_CONTEXT_REJECTED', 'Context rejected', 'The request context cannot be used by this caller.');
  }

  // 6. Resolve.
  const previewRequested = (body as { preview_mode?: unknown } | null)?.preview_mode === true;
  const outcome = await handleContentResolve(
    body,
    {
      tenantId: validation.tenantId,
      correlationId,
      traceId,
      previewPermitted: caller.scopes.has(SCOPE_PREVIEW),
    },
    deps.content,
  );
  return fromOutcome(outcome, previewRequested);
}
