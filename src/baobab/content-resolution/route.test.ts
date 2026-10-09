import { describe, expect, it, vi } from 'vitest';
import { handleContentResolveRoute, type ContentRouteDependencies, type RouteRequest } from './route.js';
import { createControlPlaneContextValidator } from './control-plane-context.js';
import { createPayloadContentSource, CONTENT_SOURCES } from './payload-source.js';
import { InheritanceMode } from './types.js';

const CTX = '3f2b8c1e-5a4d-4c3b-9a1e-0123456789ab';
const CORR = '11111111-2222-4333-8444-555555555555';
const TENANT = 'tn_nabhold1';

function deps(over: Partial<ContentRouteDependencies> = {}): ContentRouteDependencies {
  return {
    authenticate: async () => ({ scopes: new Set(['content:entry:resolve']) }),
    validateContext: async () => ({ status: 'valid', tenantId: TENANT }),
    content: {
      policyFor: (key) =>
        key === 'home' ? { contentType: 'page', inheritanceMode: InheritanceMode.OVERRIDE, supportedScopes: ['TENANT', 'LOCALE'] } : undefined,
      loadCandidates: async (tenantId, key) => [
        {
          id: 'e1',
          tenantId,
          contentKey: key,
          publicationState: 'PUBLISHED',
          locale: 'en-ZA',
          data: { title: 'Home' },
        },
        { id: 'draft', tenantId, contentKey: key, publicationState: 'DRAFT', locale: 'en-ZA', data: {} },
      ],
    },
    newCorrelationId: () => CORR,
    ...over,
  };
}

const req = (over: Partial<RouteRequest> = {}): RouteRequest => ({
  authorization: 'Bearer abc.def.ghi',
  contextId: CTX,
  bodyText: JSON.stringify({ tenant_id: TENANT, content_key: 'home', locale: 'en-ZA' }),
  ...over,
});

describe('POST /v1/content/resolve pipeline', () => {
  it('resolves an exact published entry with private caching', async () => {
    const res = await handleContentResolveRoute(req(), deps());
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('private');
    expect((res.body as { matched_scope: string }).matched_scope).toBe('EXACT');
    expect((res.body as { record: { id: string } }).record.id).toBe('e1');
  });

  it('401 without a verified bearer token', async () => {
    for (const authorization of [undefined, null, '', 'Basic abc', 'Bearer ']) {
      const res = await handleContentResolveRoute(req({ authorization }), deps());
      expect(res.status, String(authorization)).toBe(401);
    }
    const res = await handleContentResolveRoute(req(), deps({ authenticate: async () => null }));
    expect(res.status).toBe(401);
  });

  it('403 without the resolve scope, without contacting the Control Plane', async () => {
    const validateContext = vi.fn();
    const res = await handleContentResolveRoute(
      req(),
      deps({ authenticate: async () => ({ scopes: new Set(['content:entry:preview']) }), validateContext }),
    );
    expect(res.status).toBe(403);
    expect(validateContext).not.toHaveBeenCalled();
  });

  it('400 for missing or malformed context_id, bad JSON, oversize body', async () => {
    for (const contextId of [undefined, null, '', 'not-a-uuid']) {
      expect((await handleContentResolveRoute(req({ contextId }), deps())).status).toBe(400);
    }
    expect((await handleContentResolveRoute(req({ bodyText: '{' }), deps())).status).toBe(400);
    expect((await handleContentResolveRoute(req({ bodyText: ' '.repeat(9000) }), deps())).status).toBe(400);
  });

  it('403 CONTENT_CONTEXT_REJECTED for a rejected context and for a tenant mismatch, indistinguishably', async () => {
    const rejected = await handleContentResolveRoute(req(), deps({ validateContext: async () => ({ status: 'rejected' }) }));
    const mismatch = await handleContentResolveRoute(
      req({ bodyText: JSON.stringify({ tenant_id: 'tn_other', content_key: 'home' }) }),
      deps(),
    );
    expect(rejected.status).toBe(403);
    expect(mismatch.status).toBe(403);
    const a = rejected.body as { code: string; detail: string };
    const b = mismatch.body as { code: string; detail: string };
    expect(a.code).toBe('CONTENT_CONTEXT_REJECTED');
    expect(b.code).toBe('CONTENT_CONTEXT_REJECTED');
    expect(a.detail).toBe(b.detail);
  });

  it('503 retryable when the Control Plane is unavailable or throws', async () => {
    for (const validateContext of [
      async () => ({ status: 'unavailable' as const }),
      async () => {
        throw new Error('boom');
      },
    ]) {
      const res = await handleContentResolveRoute(req(), deps({ validateContext }));
      expect(res.status).toBe(503);
      expect((res.body as { retryable: boolean }).retryable).toBe(true);
    }
  });

  it('preview needs the preview scope and is never cached', async () => {
    const body = JSON.stringify({ tenant_id: TENANT, content_key: 'home', preview_mode: true });
    const denied = await handleContentResolveRoute(req({ bodyText: body }), deps());
    expect(denied.status).toBe(403);
    expect((denied.body as { code: string }).code).toBe('CONTENT_PREVIEW_NOT_PERMITTED');

    const ok = await handleContentResolveRoute(
      req({ bodyText: body }),
      deps({ authenticate: async () => ({ scopes: new Set(['content:entry:resolve', 'content:entry:preview']) }) }),
    );
    expect(ok.status).toBe(200);
    expect(ok.headers['cache-control']).toBe('no-store');
  });

  it('404 for an unknown content key', async () => {
    const res = await handleContentResolveRoute(
      req({ bodyText: JSON.stringify({ tenant_id: TENANT, content_key: 'nope' }) }),
      deps(),
    );
    expect(res.status).toBe(404);
  });

  it('passes the caller token only to the context validator and never into a response', async () => {
    const validateContext = vi.fn(async () => ({ status: 'rejected' as const }));
    const res = await handleContentResolveRoute(req({ authorization: 'Bearer secret.token.value' }), deps({ validateContext }));
    expect(validateContext).toHaveBeenCalledWith(expect.objectContaining({ subjectToken: 'secret.token.value', contextId: CTX }));
    expect(JSON.stringify(res)).not.toContain('secret.token.value');
  });

  it('echoes a valid correlation id and ignores a malformed traceparent', async () => {
    const res = await handleContentResolveRoute(
      req({ correlationId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', traceparent: 'bad', authorization: undefined }),
      deps(),
    );
    expect((res.body as { correlation_id: string }).correlation_id).toBe('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee');
    expect((res.body as { trace_id?: string }).trace_id).toBeUndefined();
  });
});

describe('Control Plane context validator', () => {
  const valid = (over: object = {}) => ({
    context_id: CTX,
    tenant_id: TENANT,
    resolved_at: '2026-10-09T00:00:00Z',
    expires_at: '2099-01-01T00:00:00Z',
    authority_purpose: 'RUNTIME',
    ...over,
  });
  const run = (fetchImpl: typeof fetch, tokens = { getToken: async () => 'validator-token' }) =>
    createControlPlaneContextValidator({ baseUrl: 'https://cp.example/', tokens, fetchImpl })({
      contextId: CTX,
      subjectToken: 'subject-token-0123456789',
      correlationId: CORR,
    });
  const json = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

  it('accepts a RUNTIME unexpired context and sends the subject token in the body only', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(valid()), { status: 200 })) as unknown as typeof fetch;
    expect(await run(fetchImpl)).toEqual({ status: 'valid', tenantId: TENANT });
    const [url, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://cp.example/v1/platform-context/validate');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer validator-token');
    expect(JSON.parse(String(init.body))).toEqual({ context_id: CTX, subject_token: 'subject-token-0123456789' });
    expect(url).not.toContain('subject-token');
  });

  it('rejects non-RUNTIME, expired, mismatched or malformed answers', async () => {
    for (const bad of [
      valid({ authority_purpose: 'TENANT_PROVISIONING' }),
      valid({ expires_at: '2001-01-01T00:00:00Z' }),
      valid({ context_id: '99999999-2222-4333-8444-555555555555' }),
      valid({ tenant_id: 'Nabhold' }),
      valid({ expires_at: undefined }),
    ]) {
      expect(await run(json(200, bad))).toEqual({ status: 'rejected' });
    }
  });

  it('treats 4xx as rejected, 5xx/429/network/token failure as unavailable', async () => {
    for (const s of [400, 401, 403, 404]) expect(await run(json(s, {}))).toEqual({ status: 'rejected' });
    for (const s of [429, 500, 503]) expect(await run(json(s, {}))).toEqual({ status: 'unavailable' });
    expect(await run((async () => { throw new Error('net'); }) as unknown as typeof fetch)).toEqual({ status: 'unavailable' });
    expect(await run(json(200, valid()), { getToken: async () => { throw new Error('no token'); } })).toEqual({ status: 'unavailable' });
  });
});

describe('Payload content source', () => {
  type Call = { collection: string; where: Record<string, unknown> };
  function fake(tenants: Array<Record<string, unknown>>, docs: Array<Record<string, unknown>>) {
    const calls: Call[] = [];
    return {
      calls,
      payload: {
        async find(args: Call & { limit: number; depth: number; overrideAccess: boolean }) {
          calls.push({ collection: args.collection, where: args.where });
          return { docs: args.collection === 'tenants' ? tenants : docs };
        },
      },
    };
  }

  it('registers exactly the five singleton keys, all OVERRIDE', () => {
    expect(Object.keys(CONTENT_SOURCES).sort()).toEqual(['footer', 'group-profile', 'home', 'navigation', 'site-settings']);
    for (const s of Object.values(CONTENT_SOURCES)) expect(s.policy.inheritanceMode).toBe('OVERRIDE');
  });

  it('maps a site configuration to a resolvable record keyed by Control Plane tenant and canonical scope ids', async () => {
    const { payload, calls } = fake([{ id: 'local-1' }], [
      {
        id: 'row1', canonicalEntityId: 'SC-1', title: 'Nav', publicationState: 'PUBLISHED', locale: 'en-ZA', contentScope: 'MARKET',
        organisation: { id: 'o', canonicalLegalEntityId: 'NABHOLD' },
        digitalEstate: { id: 'd', canonicalDigitalEstateId: 'DE-1' },
        market: { id: 'm', canonicalMarketId: 'MK-1' },
        navigationItems: [{ id: 'x', label: 'About', href: '/about' }],
      },
    ]);
    const [record] = await createPayloadContentSource(payload).loadCandidates(TENANT, 'navigation');
    expect(record).toMatchObject({
      id: 'SC-1', tenantId: TENANT, contentKey: 'navigation', legalEntityId: 'NABHOLD',
      digitalEstateId: 'DE-1', marketId: 'MK-1', locale: 'en-ZA', publicationState: 'PUBLISHED',
    });
    expect(record.data.navigationItems).toEqual([{ label: 'About', href: '/about' }]);
    expect(JSON.stringify(calls[1].where)).toContain('local-1');
    expect(JSON.stringify(calls[1].where)).toContain('navigation');
  });

  it('declares only the dimensions its content scope reaches', async () => {
    const row = {
      id: 'r', canonicalEntityId: 'SC-2', publicationState: 'PUBLISHED', locale: 'en-ZA',
      organisation: { canonicalLegalEntityId: 'NABHOLD' },
      digitalEstate: { canonicalDigitalEstateId: 'DE-1' },
      market: { canonicalMarketId: 'MK-1' },
    };
    const load = async (contentScope: string) =>
      (await createPayloadContentSource(fake([{ id: 't' }], [{ ...row, contentScope }]).payload).loadCandidates(TENANT, 'footer'))[0];
    expect(await load('TENANT')).toMatchObject({ legalEntityId: undefined, digitalEstateId: undefined, marketId: undefined, locale: 'en-ZA' });
    expect(await load('DIGITAL_ESTATE')).toMatchObject({ legalEntityId: 'NABHOLD', digitalEstateId: 'DE-1', marketId: undefined });
  });

  it('omits null seo values so the estate schema accepts the data', async () => {
    const { payload } = fake([{ id: 't' }], [
      { id: 'r', canonicalEntityId: 'SC-3', publicationState: 'PUBLISHED', contentScope: 'TENANT', seo: { title: null, description: 'd', openGraphImage: null, robots: { index: true, follow: null } }, siteName: 'N' },
    ]);
    const [record] = await createPayloadContentSource(payload).loadCandidates(TENANT, 'site-settings');
    expect(record.data.seo).toEqual({ description: 'd', robots: { index: true } });
    expect(record.data.siteName).toBe('N');
  });

  it('returns nothing for an unknown key, an unprojected tenant, or an ambiguous tenant mapping', async () => {
    const src = (t: Array<Record<string, unknown>>) => createPayloadContentSource(fake(t, [{ id: 'x' }]).payload);
    expect(await src([{ id: '1' }]).loadCandidates(TENANT, 'unknown')).toEqual([]);
    expect(await src([]).loadCandidates(TENANT, 'home')).toEqual([]);
    expect(await src([{ id: '1' }, { id: '2' }]).loadCandidates(TENANT, 'home')).toEqual([]);
  });

  it('maps page status onto publication state', async () => {
    const { payload } = fake([{ id: 'l' }], [{ id: 'p', status: 'archived', title: 'Home', slug: 'home' }]);
    const [record] = await createPayloadContentSource(payload).loadCandidates(TENANT, 'home');
    expect(record.publicationState).toBe('ARCHIVED');
  });
});
