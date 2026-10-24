import * as oauth from 'openid-client';
import type { ValidatorTokenProvider } from '../content-resolution/control-plane-context.js';

const CLIENT = 'baobab-int03-cms-validator';
const AUDIENCE = 'baobab-control-plane';
const SCOPE = 'context:validate';

class ValidatorUnavailable extends Error {
  constructor() { super('Development validator unavailable'); }
}

function https(value: string | undefined): URL {
  const url = new URL(value ?? '');
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.search) throw new ValidatorUnavailable();
  return url;
}

/** Narrow, bounded transport for the maintained OAuth client. Pin exact
 * destinations before sending a credential and bound decoded response bytes
 * through completion, including a peer that stalls after returning headers.
 */
function transport(endpoints: string[], fetcher: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      const url = https(String(input)).href;
      if (!endpoints.includes(url) || process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') throw new Error();
      const signal = AbortSignal.any([AbortSignal.timeout(5000), ...(init?.signal ? [init.signal] : [])]);
      const response = await fetcher(url, { ...init, redirect: 'error', cache: 'no-store', signal });
      if (!response.ok || !/^application\/json(?:;|$)/i.test(response.headers.get('content-type') ?? '') || !response.body) throw new Error();
      const reader = response.body.getReader();
      let abort: (() => void) | undefined;
      const deadline = new Promise<never>((_, reject) => {
        abort = () => { void reader.cancel().catch(() => undefined); reject(new ValidatorUnavailable()); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted) abort();
      });
      try {
        const chunks: Uint8Array[] = []; let length = 0;
        while (true) {
          const part = await Promise.race([reader.read(), deadline]);
          if (part.done) break;
          length += part.value.byteLength;
          if (length > 65536) throw new Error();
          chunks.push(part.value);
        }
        signal.throwIfAborted();
        return new Response(Buffer.concat(chunks, length), { headers: { 'Content-Type': 'application/json' } });
      } finally {
        if (abort) signal.removeEventListener('abort', abort);
        void reader.cancel().catch(() => undefined);
      }
    } catch { throw new ValidatorUnavailable(); }
  };
}

/** Only the separately accepted development validator may use this profile.
 * A fixed token or production CMS credential cannot be its fallback. Nothing
 * here provisions a client, promotes a registry row or grants business access.
 * The disposable harness owns deadline, independent secret and early teardown.
 */
export function createDevelopmentValidatorTokens(
  env: Record<string, string | undefined> = process.env,
  fetcher: typeof fetch = fetch,
): ValidatorTokenProvider {
  try {
    if (env.CMS_CONTEXT_VALIDATOR_MODE !== 'development-proof' || env.CMS_WORKLOAD_ENVIRONMENT !== 'development' ||
        env.CMS_WORKLOAD_CLIENT_ID !== CLIENT || env.CMS_TOKEN_AUDIENCE !== 'baobab-cms' || env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ||
        env.CMS_CONTEXT_VALIDATOR_TOKEN) throw new Error();
    // Issuer identifiers are exact protocol strings, not normalized origins.
    const issuer = env.CMS_TOKEN_ISSUER ?? '';
    https(issuer);
    const cp = https(env.CONTROL_PLANE_URL);
    if (cp.pathname !== '/' || https(env.CMS_TOKEN_JWKS_URL).origin !== new URL(issuer).origin) throw new Error();
    const tokenEndpoint = https(env.CMS_WORKLOAD_TOKEN_ENDPOINT).href;
    const introspectionEndpoint = https(env.CMS_WORKLOAD_INTROSPECTION_ENDPOINT).href;
    if ([tokenEndpoint, introspectionEndpoint].some(u => new URL(u).origin !== new URL(issuer).origin)) throw new Error();
    const secret = env.CMS_WORKLOAD_CLIENT_SECRET;
    if (!secret || secret.length < 32 || secret.length > 4096) throw new Error();
    const deadlineText = env.CMS_PROOF_DEADLINE ?? '';
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(deadlineText)) throw new Error();
    const deadline = Date.parse(deadlineText);
    if (!Number.isFinite(deadline) || deadline <= Date.now() || deadline > Date.now() + 90 * 60_000) throw new Error();
    const config = new oauth.Configuration({ issuer, token_endpoint: tokenEndpoint, introspection_endpoint: introspectionEndpoint },
      // IAM's maintained Hydra WorkloadProvisioner selects client_secret_post.
      // Use that exact method without fallback or a borrowed client identity.
      CLIENT, undefined, oauth.ClientSecretPost(secret));
    const bounded = transport([tokenEndpoint, introspectionEndpoint], fetcher);
    config[oauth.customFetch] = (url, options) => bounded(url, { ...options,
      body: options.body instanceof Uint8Array ? Buffer.from(options.body) : options.body });
    config.timeout = 5;
    return {
      async getToken() {
        try {
          if (Date.now() >= deadline) throw new Error();
          const issued = await oauth.clientCredentialsGrant(config, { audience: AUDIENCE, scope: SCOPE });
          const received = Date.now();
          if (!issued.access_token || issued.access_token.length > 8192 || issued.token_type.toLowerCase() !== 'bearer' ||
              !Number.isSafeInteger(issued.expires_in) || issued.expires_in! <= 0 || issued.expires_in! > 300 ||
              received + issued.expires_in! * 1000 > deadline || issued.refresh_token !== undefined || issued.id_token !== undefined) throw new Error();
          const claims = await oauth.tokenIntrospection(config, issued.access_token);
          const aud = typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
          if (claims.active !== true || claims.iss !== issuer || claims.client_id !== CLIENT || claims.actor_type !== 'workload' ||
              typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
              !Array.isArray(aud) || aud.length !== 1 || aud[0] !== AUDIENCE || claims.scope !== SCOPE ||
              !Number.isSafeInteger(claims.exp) || claims.exp! * 1000 <= Date.now() || claims.exp! * 1000 > deadline ||
              claims.exp! * 1000 > received + issued.expires_in! * 1000 ||
              claims.environment !== undefined && claims.environment !== 'development' ||
              claims.owner !== undefined && claims.owner !== 'baobab-platform/baobab-cms' || Date.now() >= deadline) throw new Error();
          // Request fresh authority each time; never cache a positive result.
          // CP independently verifies this validator and the inbound caller.
          return issued.access_token;
        } catch { throw new ValidatorUnavailable(); }
      },
    };
  } catch { throw new ValidatorUnavailable(); }
}
