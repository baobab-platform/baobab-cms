import { describe, expect, it } from 'vitest';
import { CallerStatusUnavailable, developmentCallerStatus } from './development-caller-status.js';

const environment = () => ({ CMS_CONTEXT_VALIDATOR_MODE: 'development-proof', CMS_WORKLOAD_ENVIRONMENT: 'development',
  CMS_WORKLOAD_CLIENT_ID: 'baobab-int03-cms-validator', CMS_TOKEN_ISSUER: 'https://issuer.test/',
  CMS_WORKLOAD_INTROSPECTION_ENDPOINT: 'https://issuer.test/introspect', CMS_WORKLOAD_CLIENT_SECRET: 'a'.repeat(64),
  CMS_PROOF_DEADLINE: new Date(Date.now() + 600000).toISOString() });
describe('bounded current caller status', () => {
  it('uses independent credentials every time and preserves definite inactive status', async () => {
    let calls = 0;
    const status = developmentCallerStatus(environment(), async (_url, init) => {
      calls++; const body = new URLSearchParams(String(init?.body));
      expect(body.get('client_id')).toBe('baobab-int03-cms-validator');
      expect(body.get('token')).toBe('private-fixture'); expect(init?.redirect).toBe('error');
      return Response.json({ active: false });
    });
    expect(await status('private-fixture')).toEqual({ active: false });
    await status('private-fixture'); expect(calls).toBe(2);
  });
  it('fails closed on status outage, malformed and oversized responses', async () => {
    for (const response of [Response.json({}, { status: 503 }), Response.json([]), Response.json({}), Response.json({ active: 'true' }), Response.json({ padding: 'a'.repeat(65537) })]) {
      await expect(developmentCallerStatus(environment(), async () => response)('private-fixture')).rejects.toBeInstanceOf(CallerStatusUnavailable);
    }
  });
  it('refuses cross-origin and expired configuration before sending a credential', () => {
    for (const change of [{ CMS_WORKLOAD_INTROSPECTION_ENDPOINT: 'https://foreign.test/status' },
      { CMS_PROOF_DEADLINE: '2000-01-01T00:00:00.000Z' }, { NODE_TLS_REJECT_UNAUTHORIZED: '0' }]) {
      expect(() => developmentCallerStatus({ ...environment(), ...change })).toThrow(CallerStatusUnavailable);
    }
  });
});
