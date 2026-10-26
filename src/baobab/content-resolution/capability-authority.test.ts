import { afterEach, describe, expect, it, vi } from 'vitest';
import { createContentCapabilityAuthority } from './capability-authority.js';

const clock = Date.now();
const contextId = '11111111-2222-4333-8444-555555555555';
const correlationId = '22222222-2222-4333-8444-555555555555';
const providerId = 'provider_'+'1'.repeat(32), engineInstanceId = 'ei_'+'2'.repeat(32);
const input = { contextId, correlationId, subjectToken: 'synthetic-private-token' };
const resolved = () => ({ context_id: contextId, correlation_id: correlationId, capability_key: 'content.entry.resolve',
  resolution_id: 'res_'+'3'.repeat(32), grant_id: 'grant_'+'4'.repeat(32), binding_id: 'bind_'+'5'.repeat(32),
  decision: 'RESOLVED', resolved_at: new Date(clock).toISOString(), expires_at: new Date(clock+60000).toISOString(),
  invocation: { provider_id: providerId, engine_instance_id: engineInstanceId, protocol: 'http',
    contract_version: 1, service_reference: 'service://baobab-cms/content' } });
function authority(fetchImpl: typeof fetch) {
  return createContentCapabilityAuthority({ baseUrl: 'https://cp.example.test', providerId, engineInstanceId, now: () => clock, fetchImpl });
}
afterEach(() => vi.unstubAllEnvs());

describe('current native content capability authority', () => {
  it('resolves each call afresh with the actual caller and no tenant/provider hints', async () => {
    const fetcher = vi.fn<typeof fetch>(async (_url, init) => {
      expect(_url).toBe('https://cp.example.test/v1/capabilities/resolve');
      expect(init).toMatchObject({ redirect: 'error', cache: 'no-store' });
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer '+input.subjectToken);
      expect(JSON.parse(String(init?.body))).toEqual({ context_id: contextId, correlation_id: correlationId,
        capability_key: 'content.entry.resolve', required_contract_version: 1 });
      return Response.json(resolved());
    });
    const resolve = authority(fetcher);
    expect((await resolve(input)).status).toBe('valid');
    expect((await resolve(input)).status).toBe('valid');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it.each(['GRANT_NOT_FOUND','SUBSCRIPTION_NOT_FOUND','BINDING_NOT_FOUND'])('denies current CP withdrawal: %s', async reason_code => {
    expect((await authority(async () => Response.json({ ...resolved(), decision: 'DENIED', reason_code }))(input)).status).toBe('rejected');
  });
  it('rejects substitution, missing provenance and stale or unbounded decisions', async () => {
    for (const change of [{ context_id: 'other' }, { correlation_id: 'other' }, { capability_key: 'other.entry.resolve' },
      { resolution_id: undefined }, { grant_id: undefined }, { binding_id: undefined }, { expires_at: undefined },
      { expires_at: new Date(clock-1).toISOString() }, { resolved_at: new Date(clock-31000).toISOString() },
      { expires_at: new Date(clock+16*60000).toISOString() }, { invocation: { ...resolved().invocation, provider_id: 'provider_'+'a'.repeat(32) } },
      { invocation: { ...resolved().invocation, engine_instance_id: 'ei_'+'a'.repeat(32) } },
      { invocation: { ...resolved().invocation, contract_version: 2 } },
      { invocation: { ...resolved().invocation, service_reference: 'https://untrusted.example.test' } }]) {
      expect((await authority(async () => Response.json({ ...resolved(), ...change }))(input)).status).toBe('rejected');
    }
  });
  it('fails closed on CP outage, malformed JSON and oversized decoded bodies', async () => {
    for (const response of [new Response('', { status: 503 }), new Response('{'), new Response(' '.repeat(65537))]) {
      expect((await authority(async () => response)(input)).status).toBe('unavailable');
    }
    expect((await authority(async () => { throw new Error('private-peer-body'); })(input)).status).toBe('unavailable');
  });
  it('refuses unsafe credential destinations and disabled TLS verification', async () => {
    for (const baseUrl of ['http://cp.example.test','https://user:password@cp.example.test','https://cp.example.test/prefix','https://cp.example.test?secret=hidden']) {
      expect(() => createContentCapabilityAuthority({ baseUrl, providerId, engineInstanceId })).toThrow();
    }
    const fetcher = vi.fn<typeof fetch>();
    vi.stubEnv('NODE_TLS_REJECT_UNAUTHORIZED','0');
    expect((await authority(fetcher)(input)).status).toBe('unavailable');
    expect(fetcher).not.toHaveBeenCalled();
  });
});
