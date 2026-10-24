import { createServer } from 'node:http';
import { once } from 'node:events';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createCallerAuthenticator } from './caller-auth.js';
import { handleContentResolveRoute } from './route.js';

/**
 * Cryptographic boundary regression: a real local JWKS service verifies signed
 * tokens, rather than mocking jwtVerify. Keys, users and issuer are synthetic
 * and cannot serve as protected staging credentials or acceptance evidence.
 */
const issuer = 'https://iam.example.test/';
const audience = 'baobab-cms';
let key: Awaited<ReturnType<typeof generateKeyPair>>;
let server: ReturnType<typeof createServer>;
let authenticate: ReturnType<typeof createCallerAuthenticator>;

beforeAll(async () => {
  key = await generateKeyPair('ES256');
  const jwk = { ...await exportJWK(key.publicKey), kid: 'fixture', alg: 'ES256', use: 'sig' };
  server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ keys: [jwk] }));
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Fixture listener unavailable');
  authenticate = createCallerAuthenticator({ issuer, audience, jwksUrl: `http://127.0.0.1:${address.port}/jwks` });
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});
async function token(scope: unknown, overrides: Record<string, unknown> = {}) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({ actor_type: 'workload', scope, iss: issuer, aud: audience,
    sub: 'fixture-workload', jti: 'fixture-unique-id', iat: now, exp: now + 60, ...overrides })
    .setProtectedHeader({ alg: 'ES256', kid: 'fixture' }).sign(key.privateKey);
}

describe('CMS signed workload scope authentication', () => {
  it('accepts the registered CMS hierarchical scopes and preserves separate scopes', async () => {
    const caller = await authenticate(await token('content:entry:resolve content:entry:preview'));
    expect(caller?.scopes).toEqual(new Set(['content:entry:resolve', 'content:entry:preview']));
  });
  it('retains valid single-colon scopes without treating them as content permission', async () => {
    expect((await authenticate(await token('context:resolve')))?.scopes).toEqual(new Set(['context:resolve']));
  });
  it.each(['content::resolve', ':entry:resolve', 'content:entry:', 'content:entry:*',
    'Content:entry:resolve', 'content:entry:resolve\n', 'content:entry:resolve\r',
    'content:entry:resolve\t', 'content:entry:resolve  context:resolve',
    ' content:entry:resolve', 'content:entry:resolve ', '', null, ['content:entry:resolve']])(
    'refuses malformed scope claims %j', async (scope) => {
      expect(await authenticate(await token(scope))).toBeNull();
    },
  );
  it.each([
    { iss: 'https://other.example.test/' }, { aud: 'baobab-cp' }, { actor_type: 'human' },
    { exp: 1 }, { jti: undefined }, { sub: undefined }, { iat: undefined },
  ])('retains issuer, audience, actor, expiry and required claim fences %j', async (overrides) => {
    expect(await authenticate(await token('content:entry:resolve', overrides))).toBeNull();
  });
  it('refuses tampered and unsigned tokens', async () => {
    const signed = await token('content:entry:resolve');
    const [header, payload, signature] = signed.split('.');
    expect(await authenticate(`${header}.${payload}.${signature[0] === 'a' ? 'b' : 'a'}${signature.slice(1)}`)).toBeNull();
    expect(await authenticate(`${Buffer.from('{"alg":"none"}').toString('base64url')}.${payload}.`)).toBeNull();
  });
  it('rechecks status for the same signed bearer and binds current claims', async () => {
    let active = true;
    const signed = await token('content:entry:resolve', { azp: 'fixture-client' });
    const payload = JSON.parse(Buffer.from(signed.split('.')[1], 'base64url').toString());
    let calls = 0;
    const verify = createCallerAuthenticator({ issuer, audience,
      jwksUrl: `http://127.0.0.1:${(server.address() as { port: number }).port}/jwks`,
      currentStatus: async () => { calls++; return { ...payload, active, client_id: 'fixture-client' }; } });
    expect(await verify(signed)).not.toBeNull(); active = false;
    expect(await verify(signed)).toBeNull(); expect(calls).toBe(2);
  });
  it('keeps exact route scope and CP context enforcement after authentication', async () => {
    let contextCalls = 0;
    let contentReads = 0;
    const dependencies = { authenticate, newCorrelationId: () => '019a0000-0000-7000-8000-000000000002',
      validateContext: async () => { contextCalls++; return { status: 'rejected' as const }; },
      validateProjection: async () => true,
      content: { loadCandidates: async () => { contentReads++; return []; }, policyFor: () => undefined },
    };
    const request = { contextId: '019a0000-0000-7000-8000-000000000001', bodyText: '{}',
      correlationId: '019a0000-0000-7000-8000-000000000002' };
    expect((await handleContentResolveRoute({ ...request, authorization: `Bearer ${await token('content:entry:preview')}` }, dependencies)).status).toBe(403);
    expect(contextCalls).toBe(0);
    expect((await handleContentResolveRoute({ ...request, authorization: `Bearer ${await token('content:entry:resolve')}` }, dependencies)).status).toBe(403);
    expect(contextCalls).toBe(1);
    expect(contentReads).toBe(0);
  });
});
