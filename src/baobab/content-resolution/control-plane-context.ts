import type { ContextValidation } from './route.js';

/**
 * Calls the Control Plane's validatePlatformContext operation
 * (Shared contracts/control-plane/v1/openapi.yaml, POST /platform-context/validate).
 *
 * The validator (this engine) authenticates with its own workload token and
 * holds `context:validate`. The caller's token goes in the body as
 * `subject_token` and nowhere else. Only a RUNTIME, unexpired context counts;
 * any other answer is a rejection, and a transport failure is "unavailable".
 * Nothing is cached: contexts expire and are bound to a principal.
 */

export interface ValidatorTokenProvider {
  /** A current workload token for this engine. Must never be logged. */
  getToken(): Promise<string>;
}

export interface ControlPlaneContextConfig {
  baseUrl: string;
  tokens: ValidatorTokenProvider;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => Date;
}

const TENANT_ID = /^tn_[a-z0-9]+$/;

export function createControlPlaneContextValidator(config: ControlPlaneContextConfig) {
  const doFetch = config.fetchImpl ?? fetch;
  const now = config.now ?? (() => new Date());

  return async (input: {
    contextId: string;
    subjectToken: string;
    correlationId: string;
    traceparent?: string;
  }): Promise<ContextValidation> => {
    let validatorToken: string;
    try {
      validatorToken = await config.tokens.getToken();
    } catch {
      return { status: 'unavailable' };
    }

    let response: Response;
    try {
      response = await doFetch(`${config.baseUrl.replace(/\/+$/, '')}/v1/platform-context/validate`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validatorToken}`,
          'x-correlation-id': input.correlationId,
          ...(input.traceparent ? { traceparent: input.traceparent } : {}),
        },
        body: JSON.stringify({ context_id: input.contextId, subject_token: input.subjectToken }),
        signal: AbortSignal.timeout(config.timeoutMs ?? 3000),
      });
    } catch {
      return { status: 'unavailable' };
    }

    if (response.status >= 500 || response.status === 429) return { status: 'unavailable' };
    // 400/401/403/404 all mean this context is not usable for this caller. Reasons are not distinguished.
    if (!response.ok) return { status: 'rejected' };

    let payload: { tenant_id?: unknown; authority_purpose?: unknown; expires_at?: unknown; context_id?: unknown };
    try {
      payload = await response.json();
    } catch {
      return { status: 'unavailable' };
    }

    const expires = typeof payload.expires_at === 'string' ? Date.parse(payload.expires_at) : NaN;
    if (
      payload.authority_purpose !== 'RUNTIME' ||
      payload.context_id !== input.contextId ||
      typeof payload.tenant_id !== 'string' ||
      !TENANT_ID.test(payload.tenant_id) ||
      Number.isNaN(expires) ||
      expires <= now().getTime()
    ) {
      return { status: 'rejected' };
    }
    return { status: 'valid', tenantId: payload.tenant_id };
  };
}
