import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDevelopmentValidatorTokens } from './development-validator.js';

// Bounded protocol test, not a deployed IAM/CP/provider acceptance receipt.
function fixture() {
  const deadline = Date.now() + 60 * 60_000;
  const env: Record<string, string | undefined> = {
    CMS_CONTEXT_VALIDATOR_MODE: 'development-proof', CMS_WORKLOAD_ENVIRONMENT: 'development',
    CMS_WORKLOAD_CLIENT_ID: 'baobab-int03-cms-validator', CMS_TOKEN_AUDIENCE: 'baobab-cms',
    CMS_TOKEN_ISSUER: 'https://iam.example.test/', CMS_WORKLOAD_TOKEN_ENDPOINT: 'https://iam.example.test/token',
    CMS_TOKEN_JWKS_URL: 'https://iam.example.test/jwks', CONTROL_PLANE_URL: 'https://cp.example.test',
    CMS_WORKLOAD_INTROSPECTION_ENDPOINT: 'https://iam.example.test/introspect',
    CMS_WORKLOAD_CLIENT_SECRET: 'independent-synthetic-validator-secret-32', CMS_PROOF_DEADLINE: new Date(deadline).toISOString(),
  };
  const state = { claims: {} as Record<string, unknown>, issued: {} as Record<string, unknown>, fail: false, oversized: false };
  let count = 0;
  const fetcher = vi.fn<typeof fetch>(async (input, init) => {
    expect(init?.redirect).toBe('error'); expect(init?.cache).toBe('no-store');
    const basic = new Headers(init?.headers).get('authorization')!;
    expect(Buffer.from(basic.slice(6), 'base64').toString().split(':').map(s => decodeURIComponent(s))).toEqual([
      env.CMS_WORKLOAD_CLIENT_ID, env.CMS_WORKLOAD_CLIENT_SECRET,
    ]);
    if (state.fail) return Response.json({ secret: 'must not escape' }, { status: 503 });
    if (state.oversized) return Response.json({ padding: 'x'.repeat(65536) });
    const body = new URLSearchParams(String(init?.body));
    if (String(input) === env.CMS_WORKLOAD_TOKEN_ENDPOINT) {
      expect(body.get('grant_type')).toBe('client_credentials');
      expect(body.get('audience')).toBe('baobab-control-plane'); expect(body.get('scope')).toBe('context:validate');
      expect(body.has('subject_token')).toBe(false);
      return Response.json({ access_token: `synthetic-validator-token-${++count}`, token_type: 'Bearer', expires_in: 60, ...state.issued });
    }
    expect(String(input)).toBe(env.CMS_WORKLOAD_INTROSPECTION_ENDPOINT);
    expect(body.get('token')).toMatch(/^synthetic-validator-token-/);
    return Response.json({ active: true, iss: env.CMS_TOKEN_ISSUER, client_id: env.CMS_WORKLOAD_CLIENT_ID,
      sub: 'validator-subject', actor_type: 'workload', aud: 'baobab-control-plane', scope: 'context:validate',
      exp: Math.floor(Date.now() / 1000) + 60, ...state.claims });
  });
  return { env, state, fetcher, deadline };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });

describe('independent development CMS validator', () => {
  it('uses its own current scope/audience credentials on every call', async () => {
    const { env, fetcher } = fixture(); const tokens = createDevelopmentValidatorTokens(env, fetcher);
    await expect(tokens.getToken()).resolves.toBe('synthetic-validator-token-1');
    await expect(tokens.getToken()).resolves.toBe('synthetic-validator-token-2');
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it.each([
    { active: false }, { iss: 'https://foreign.example/' }, { client_id: 'baobab-int03-cms-consumer' }, { actor_type: 'human' },
    { sub: '' }, { aud: ['baobab-control-plane', 'baobab-cms'] }, { scope: 'context:resolve' },
    { scope: 'context:validate content:entry:resolve' }, { environment: 'production' }, { owner: 'baobab-platform/infrastructure' },
    { exp: 1 }, { exp: Math.floor(Date.now() / 1000) + 3600 },
  ])('refuses swapped, expanded or inactive token evidence %j', async claims => {
    const { env, fetcher, state } = fixture(); state.claims = claims;
    await expect(createDevelopmentValidatorTokens(env, fetcher).getToken()).rejects.toThrow('Development validator unavailable');
  });

  it.each([{ expires_in: 301 }, { expires_in: 0 }, { token_type: 'DPoP' }, { refresh_token: 'private' }, { id_token: 'private' }])(
    'refuses issuance outside the bounded profile %j', async issued => {
      const { env, fetcher, state } = fixture(); state.issued = issued;
      await expect(createDevelopmentValidatorTokens(env, fetcher).getToken()).rejects.toThrow();
    });

  it.each([
    ['CMS_WORKLOAD_ENVIRONMENT', 'production'], ['CMS_WORKLOAD_CLIENT_ID', 'baobab-cms-workload'],
    ['CMS_WORKLOAD_CLIENT_ID', 'baobab-int03-cms-consumer'], ['CMS_TOKEN_AUDIENCE', 'baobab-control-plane'],
    ['CMS_CONTEXT_VALIDATOR_MODE', 'typo'], ['CMS_CONTEXT_VALIDATOR_TOKEN', 'borrowed-static-production-token'],
    ['CMS_WORKLOAD_TOKEN_ENDPOINT', 'http://iam.example.test/token'], ['CMS_WORKLOAD_INTROSPECTION_ENDPOINT', 'https://foreign.example/introspect'],
    ['CONTROL_PLANE_URL', 'http://cp.example.test'], ['CMS_TOKEN_JWKS_URL', 'https://foreign.example/jwks'],
    ['CMS_PROOF_DEADLINE', '2100-01-01T00:00:00Z'], ['CMS_PROOF_DEADLINE', '2020-01-01T00:00:00Z'],
    ['CMS_WORKLOAD_CLIENT_SECRET', ''], ['NODE_TLS_REJECT_UNAUTHORIZED', '0'],
  ])('refuses unsafe or production profile input %s', (key, value) => {
    const { env, fetcher } = fixture();
    expect(() => createDevelopmentValidatorTokens({ ...env, [key]: value }, fetcher)).toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('stops issuance after the fixed deadline and never reuses the previous token', async () => {
    const { env, fetcher, deadline } = fixture(); const tokens = createDevelopmentValidatorTokens(env, fetcher);
    await tokens.getToken(); vi.useFakeTimers(); vi.setSystemTime(deadline);
    await expect(tokens.getToken()).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('refuses a token extending beyond the remaining run window', async () => {
    const { env, fetcher, deadline } = fixture(); const tokens = createDevelopmentValidatorTokens(env, fetcher);
    vi.useFakeTimers(); vi.setSystemTime(deadline - 30_000);
    await expect(tokens.getToken()).rejects.toThrow(); expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it('bounds decoded OAuth response bytes', async () => {
    const { env, fetcher, state } = fixture(); state.oversized = true;
    await expect(createDevelopmentValidatorTokens(env, fetcher).getToken()).rejects.toThrow('Development validator unavailable');
  });

  it('recovers after outage only by acquiring and introspecting a fresh token', async () => {
    const { env, fetcher, state } = fixture(); const tokens = createDevelopmentValidatorTokens(env, fetcher);
    state.fail = true; await expect(tokens.getToken()).rejects.toThrow('Development validator unavailable');
    state.fail = false; await expect(tokens.getToken()).resolves.toBe('synthetic-validator-token-1');
  });
});
