/** Current native issuer status for the named development CMS path.
 * The separate CMS validator authenticates this read; it never mints caller
 * authority. No positive cache, product credential fallback or private logs.
 */
export class CallerStatusUnavailable extends Error {
  constructor() { super('Current caller status unavailable'); }
}
export function developmentCallerStatus(env: Record<string, string | undefined> = process.env, fetcher: typeof fetch = fetch) {
  const issuer = new URL(env.CMS_TOKEN_ISSUER ?? '');
  const endpoint = new URL(env.CMS_WORKLOAD_INTROSPECTION_ENDPOINT ?? '');
  const deadline = Date.parse(env.CMS_PROOF_DEADLINE ?? '');
  const secret = env.CMS_WORKLOAD_CLIENT_SECRET ?? '';
  if (env.CMS_CONTEXT_VALIDATOR_MODE !== 'development-proof' || env.CMS_WORKLOAD_ENVIRONMENT !== 'development' ||
      env.CMS_WORKLOAD_CLIENT_ID !== 'baobab-int03-cms-validator' || issuer.protocol !== 'https:' ||
      issuer.username || issuer.password || issuer.search || issuer.hash || endpoint.origin !== issuer.origin || endpoint.username || endpoint.password || endpoint.search || endpoint.hash ||
      secret.length < 32 || secret.length > 4096 || !Number.isFinite(deadline) || deadline <= Date.now() ||
      deadline > Date.now() + 90 * 60_000 || env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new CallerStatusUnavailable();
  return async (token: string): Promise<Record<string, unknown>> => {
    try {
      if (Date.now() >= deadline || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error();
      const signal = AbortSignal.timeout(5000);
      const response = await fetcher(endpoint.href, { method: 'POST', redirect: 'error', cache: 'no-store', signal,
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ token, client_id: 'baobab-int03-cms-validator', client_secret: secret }) });
      if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new Error();
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      const abort = () => { void reader.cancel().catch(() => undefined); };
      signal.addEventListener('abort', abort, { once: true });
      try {
        for (;;) {
          signal.throwIfAborted(); const part = await reader.read(); signal.throwIfAborted();
          if (part.done) break;
          size += part.value.byteLength; if (size > 65536) throw new Error(); chunks.push(part.value);
        }
        const value: unknown = JSON.parse(Buffer.concat(chunks, size).toString('utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value) || typeof (value as Record<string, unknown>).active !== 'boolean' || Date.now() >= deadline) throw new Error();
        return value as Record<string, unknown>;
      } finally { signal.removeEventListener('abort', abort); void reader.cancel().catch(() => undefined); }
    } catch { throw new CallerStatusUnavailable(); }
  };
}
