/** Current CP authority for this resource server. No positive decision cache. */
export interface ContentCapabilityAuthority {
  resolutionId: string;
  grantId: string;
  bindingId: string;
  providerId: string;
  engineInstanceId: string;
}

export type CapabilityValidation =
  | { status: 'valid'; authority: ContentCapabilityAuthority }
  | { status: 'rejected' }
  | { status: 'unavailable' };

export interface CapabilityInput {
  contextId: string;
  subjectToken: string;
  correlationId: string;
  traceparent?: string;
}

/** The caller needs both CP and CMS audiences, within its existing registry
 * allocation. The independent context validator never borrows caller authority.
 * Only the configured provider/instance may consume the current resolution.
 */
export function createContentCapabilityAuthority(config: {
  baseUrl: string;
  providerId: string;
  engineInstanceId: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const origin = new URL(config.baseUrl);
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' ||
      origin.search || origin.hash || !/^provider_[0-9a-f]{32}$/.test(config.providerId) ||
      !/^ei_[0-9a-f]{32}$/.test(config.engineInstanceId)) throw new Error('Invalid capability authority configuration');
  const endpoint = new URL('/v1/capabilities/resolve', origin).href;
  const fetcher = config.fetchImpl ?? fetch;
  const now = config.now ?? Date.now;
  return async (input: CapabilityInput): Promise<CapabilityValidation> => {
    if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') return { status: 'unavailable' };
    const signal = AbortSignal.timeout(3000);
    try {
      const response = await fetcher(endpoint, {
        method: 'POST', redirect: 'error', cache: 'no-store', signal,
        headers: { authorization: `Bearer ${input.subjectToken}`, 'content-type': 'application/json',
          'x-correlation-id': input.correlationId, ...(input.traceparent ? { traceparent: input.traceparent } : {}) },
        body: JSON.stringify({ context_id: input.contextId, capability_key: 'content.entry.resolve',
          required_contract_version: 1, correlation_id: input.correlationId }),
      });
      if (response.status >= 500 || response.status === 429 || response.redirected) {
        void response.body?.cancel().catch(() => undefined); return { status: 'unavailable' };
      }
      if (response.status !== 200) { void response.body?.cancel().catch(() => undefined); return { status: 'rejected' }; }
      if (!response.body) return { status: 'unavailable' };
      const reader = response.body.getReader();
      const cancel = () => { void reader.cancel().catch(() => undefined); };
      signal.addEventListener('abort', cancel, { once: true });
      let raw = '';
      let size = 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      try {
        for (;;) {
          signal.throwIfAborted();
          const { done, value } = await reader.read();
          signal.throwIfAborted();
          if (done) break;
          size += value.byteLength;
          if (size > 65536) throw new Error('Bounded resolution required');
          raw += decoder.decode(value, { stream: true });
        }
        raw += decoder.decode();
      } finally { signal.removeEventListener('abort', cancel); cancel(); reader.releaseLock(); }
      const body = JSON.parse(raw);
      if (body.context_id !== input.contextId || body.correlation_id !== input.correlationId ||
          body.capability_key !== 'content.entry.resolve') return { status: 'rejected' };
      if (body.decision === 'UNAVAILABLE') return { status: 'unavailable' };
      if (body.decision !== 'RESOLVED') return { status: 'rejected' };
      const invocation = body.invocation;
      const resolved = Date.parse(body.resolved_at), expires = Date.parse(body.expires_at), clock = now();
      if (!/^res_[0-9a-f]{32}$/.test(body.resolution_id) || !/^grant_[0-9a-f]{32}$/.test(body.grant_id) ||
          !/^bind_[0-9a-f]{32}$/.test(body.binding_id) || !Number.isFinite(resolved) || !Number.isFinite(expires) ||
          resolved < clock - 30000 || resolved > clock + 30000 || expires <= clock || expires <= resolved ||
          expires - resolved > 15 * 60_000 || invocation?.provider_id !== config.providerId ||
          invocation.engine_instance_id !== config.engineInstanceId || invocation.contract_version !== 1 ||
          invocation.protocol !== 'http' || invocation.service_reference !== 'service://baobab-cms/content' ||
          (invocation.route_reference !== undefined && invocation.route_reference !== '/v1/content/resolve')) return { status: 'rejected' };
      return { status: 'valid', authority: { resolutionId: body.resolution_id, grantId: body.grant_id,
        bindingId: body.binding_id, providerId: invocation.provider_id, engineInstanceId: invocation.engine_instance_id } };
    } catch { return { status: 'unavailable' }; }
  };
}
