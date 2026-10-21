import { afterEach, expect, it, vi } from 'vitest';
vi.mock('payload', () => ({ getPayload: vi.fn() }));
vi.mock('../../../../../payload.config.js', () => ({ default: {} }));
import { getPayload } from 'payload';
import { POST } from './route.js';

afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it.each(['', 'typo', 'development-proof'])('never falls back to a fixed product token when explicit mode is invalid: %s', async mode => {
  vi.stubEnv('CMS_CONTEXT_VALIDATOR_MODE', mode);
  vi.stubEnv('CMS_CONTEXT_VALIDATOR_TOKEN', 'synthetic-borrowed-product-token');
  vi.stubEnv('CMS_TOKEN_ISSUER', 'https://iam.example.test/');
  vi.stubEnv('CMS_TOKEN_AUDIENCE', 'baobab-cms');
  vi.stubEnv('CMS_TOKEN_JWKS_URL', 'https://iam.example.test/jwks');
  vi.stubEnv('CONTROL_PLANE_URL', 'https://cp.example.test');
  const response = await POST(new Request('https://cms.example.test/v1/content/resolve', { method: 'POST', headers: { authorization: 'Bearer unverified' }, body: '{}' }));
  expect(response.status).toBe(503);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(await response.text()).not.toContain('synthetic-borrowed');
  expect(getPayload).not.toHaveBeenCalled();
});


it.each([undefined, 'Basic hidden', 'Bearer token extra'])('denies anonymous or malformed auth before configuration/database: %s', async authorization => {
  vi.stubEnv('CMS_CONTEXT_VALIDATOR_MODE', 'invalid');
  const response = await POST(new Request('https://cms.example.test/v1/content/resolve', {
    method: 'POST', headers: authorization ? { authorization } : {}, body: '{}',
  }));
  expect(response.status).toBe(401);
  expect(await response.json()).toMatchObject({ code: 'AUTHENTICATION_REQUIRED' });
  expect(getPayload).not.toHaveBeenCalled();
});
