import { describe, expect, it } from 'vitest';
import { resolveContext, tryResolveContext, createSystemContext, assertMatchingTenant } from './resolve.js';
import { ContextResolutionError } from './errors.js';
import type { ContextActor, ContextRequest } from './resolve.js';

function makeRequest(user: ContextActor | null, headers: Record<string, string> = {}): ContextRequest {
  return {
    user,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? headers[name] ?? null },
  };
}

describe('resolveContext', () => {
  it('fails closed when there is no authenticated actor', () => {
    expect(() => resolveContext(makeRequest(null))).toThrow(ContextResolutionError);
  });

  it('fails closed when the actor has no bound tenant and is not a platform admin', () => {
    const req = makeRequest({ id: '1' });
    expect(() => resolveContext(req)).toThrow(/canonical tenant/);
  });

  it('resolves an ordinary tenant context', () => {
    const req = makeRequest({ id: '1', tenantId: 'tenant-a', canonicalActorId: 'actor-1' });
    const context = resolveContext(req);
    expect(context.kind).toBe('tenant');
    if (context.kind === 'tenant') {
      expect(context.tenantId).toBe('tenant-a');
      expect(context.actorId).toBe('actor-1');
      expect(context.isPlatformAdmin).toBe(false);
    }
  });

  it('resolves a platform context for a platform administrator with no bound tenant', () => {
    const req = makeRequest({ id: '1', platformAdministrator: true });
    const context = resolveContext(req);
    expect(context.kind).toBe('platform');
    expect(context.isPlatformAdmin).toBe(true);
  });

  it('rejects a requested digital estate outside the actor authorized bindings (fail closed on spoofed context)', () => {
    const req = makeRequest(
      { id: '1', tenantId: 'tenant-a', digitalEstateIds: ['estate-a'] },
      { 'x-baobab-digital-estate-id': 'estate-b' },
    );
    expect(() => resolveContext(req)).toThrow(/not among the actor's authorized bindings/);
  });

  it('accepts a requested digital estate that is within the authorized bindings', () => {
    const req = makeRequest(
      { id: '1', tenantId: 'tenant-a', digitalEstateIds: ['estate-a', 'estate-b'] },
      { 'x-baobab-digital-estate-id': 'estate-b' },
    );
    const context = resolveContext(req);
    if (context.kind === 'tenant') {
      expect(context.digitalEstateId).toBe('estate-b');
    }
  });

  it.each([
    ['digital estate', 'x-baobab-digital-estate-id', 'digitalEstateIds'],
    ['market', 'x-baobab-market-id', 'marketIds'],
    ['locale', 'x-baobab-locale', 'locales'],
  ] as const)('denies a requested %s when bindings are absent or empty', (_dimension, header, property) => {
    const requested = { [header]: 'ungranted' };
    const base = { id: 'actor-1', tenantId: 'tenant-a' };
    expect(() => resolveContext(makeRequest(base, requested))).toThrow(ContextResolutionError);
    expect(() => resolveContext(makeRequest({ ...base, [property]: [] }, requested))).toThrow(ContextResolutionError);
    expect(tryResolveContext(makeRequest(base, requested))).toBeNull();
  });

  it.each([
    ['market', 'x-baobab-market-id', 'marketIds', 'market-a'],
    ['locale', 'x-baobab-locale', 'locales', 'en'],
  ] as const)('permits %s only when explicitly bound', (_dimension, header, property, value) => {
    const context = resolveContext(makeRequest({
      id: 'actor-1', tenantId: 'tenant-a', [property]: [value],
    }, { [header]: value }));
    expect(context.kind).toBe('tenant');
    if (context.kind === 'tenant') {
      expect((context as unknown as Record<string, unknown>)[property === 'marketIds' ? 'marketId' : 'locale']).toBe(value);
    }
  });

  it('generates a correlation id when none is supplied and reuses one that is', () => {
    const req1 = makeRequest({ id: '1', tenantId: 'tenant-a' });
    const context1 = resolveContext(req1);
    expect(context1.correlationId).toBeTruthy();

    const req2 = makeRequest({ id: '1', tenantId: 'tenant-a' }, { 'x-baobab-correlation-id': 'corr-123' });
    const context2 = resolveContext(req2);
    expect(context2.correlationId).toBe('corr-123');
  });

  it('tryResolveContext returns null instead of throwing', () => {
    expect(tryResolveContext(makeRequest(null))).toBeNull();
  });
});

describe('createSystemContext', () => {
  it('builds an explicit platform-scoped context', () => {
    const context = createSystemContext({ actorId: 'system:migration' });
    expect(context.kind).toBe('platform');
    expect(context.isPlatformAdmin).toBe(true);
  });
});

describe('assertMatchingTenant', () => {
  it('passes for a matching tenant', () => {
    const context = resolveContext(makeRequest({ id: '1', tenantId: 'tenant-a' }));
    expect(() => assertMatchingTenant(context, 'tenant-a')).not.toThrow();
  });

  it('fails closed on a tenant mismatch — the core negative-tenancy invariant', () => {
    const context = resolveContext(makeRequest({ id: '1', tenantId: 'tenant-a' }));
    expect(() => assertMatchingTenant(context, 'tenant-b')).toThrow(ContextResolutionError);
  });

  it('fails closed when the record has no tenant at all', () => {
    const context = resolveContext(makeRequest({ id: '1', tenantId: 'tenant-a' }));
    expect(() => assertMatchingTenant(context, undefined)).toThrow(ContextResolutionError);
  });

  it('platform context bypasses the tenant match (still requires isPlatformAdmin upstream)', () => {
    const context = createSystemContext({ actorId: 'system' });
    expect(() => assertMatchingTenant(context, undefined)).not.toThrow();
  });
});
