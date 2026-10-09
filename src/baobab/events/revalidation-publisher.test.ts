import { describe, expect, it, vi } from 'vitest';
import { NabholdRevalidationPublisher, RevalidationDeliveryError, toRevalidateRequest } from './revalidation-publisher.js';
import type { CanonicalEventEnvelope } from './types.js';

const SECRET = 'a-long-enough-secret-value';
const env = (over: Partial<CanonicalEventEnvelope> = {}, payload: Record<string, unknown> = {}): CanonicalEventEnvelope => ({
  eventId: 'evt-1', eventType: 'content.published', eventVersion: 1, occurredAt: '2026-10-09T00:00:00Z', sourceEngine: 'CONTENT',
  canonicalEntityId: 'X-1', canonicalEntityType: 'SITE_CONFIGURATION', tenantId: 'local-t1', correlationId: 'corr-1',
  payload: { collection: 'site-configurations', contentKey: 'navigation', ...payload }, ...over,
});
const make = (fetchImpl: typeof fetch, over: object = {}) =>
  new NabholdRevalidationPublisher({ url: 'https://nabhold.com/api/revalidate', secret: SECRET, tenantId: 'local-t1', fetchImpl, ...over });
const respond = (status: number) => vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch;

describe('toRevalidateRequest', () => {
  it('maps singletons from either collection to the estate form', () => {
    for (const key of ['home', 'navigation', 'footer', 'site-settings', 'group-profile']) {
      expect(toRevalidateRequest(env({}, { collection: 'pages', contentKey: key }))).toEqual({ collection: 'pages', contentKey: key });
      expect(toRevalidateRequest(env({}, { contentKey: key }))).toEqual({ collection: 'pages', contentKey: key });
    }
  });
  it('maps slug collections', () => {
    expect(toRevalidateRequest(env({}, { collection: 'insights', slug: 'x', contentKey: undefined }))).toEqual({ collection: 'insights', slug: 'x' });
  });
  it('ignores unknown keys, missing slugs, other collections and non-content events', () => {
    expect(toRevalidateRequest(env({}, { contentKey: 'other' }))).toBeNull();
    expect(toRevalidateRequest(env({}, { collection: 'sectors', slug: '' }))).toBeNull();
    expect(toRevalidateRequest(env({}, { collection: 'product-content', slug: 'a' }))).toBeNull();
    expect(toRevalidateRequest(env({ eventType: 'media.published' }))).toBeNull();
  });
});

describe('NabholdRevalidationPublisher', () => {
  it('posts the narrow body with the bearer secret and diagnostics headers', async () => {
    const f = respond(200);
    await make(f).publish(env());
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://nabhold.com/api/revalidate');
    expect(JSON.parse(String(init.body))).toEqual({ collection: 'pages', contentKey: 'navigation' });
    const h = init.headers as Record<string, string>;
    expect(h.authorization).toBe(`Bearer ${SECRET}`);
    expect(h['idempotency-key']).toBe('evt-1');
    expect(init.redirect).toBe('error');
  });

  it('does nothing for another tenant or an irrelevant event', async () => {
    const f = respond(200);
    await make(f).publish(env({ tenantId: 'other' }));
    await make(f).publish(env({ eventType: 'media.created' }));
    expect(f).not.toHaveBeenCalled();
  });

  it('marks 400/401/403/404 permanent and 429/5xx retryable', async () => {
    for (const status of [400, 401, 403, 404]) {
      await expect(make(respond(status)).publish(env())).rejects.toMatchObject({ permanent: true });
    }
    for (const status of [429, 500, 502, 503]) {
      await expect(make(respond(status)).publish(env())).rejects.toMatchObject({ permanent: false });
    }
  });

  it('treats network failure, timeout and redirects as retryable without leaking the secret or URL', async () => {
    const f = (async () => { throw new Error(`boom ${SECRET} https://nabhold.com/api/revalidate`); }) as unknown as typeof fetch;
    const err = await make(f).publish(env()).catch((e) => e);
    expect(err).toBeInstanceOf(RevalidationDeliveryError);
    expect(err.permanent).toBe(false);
    expect(err.message).not.toContain(SECRET);
    expect(err.message).not.toContain('nabhold.com');
    const e401 = await make(respond(401)).publish(env()).catch((e) => e);
    expect(e401.message).not.toContain(SECRET);
  });

  it('refuses unsafe configuration', () => {
    const f = respond(200);
    expect(() => make(f, { url: 'http://nabhold.com/api/revalidate' })).toThrow();
    expect(() => make(f, { url: 'https://user:pw@nabhold.com/x' })).toThrow();
    expect(() => make(f, { secret: 'short' })).toThrow();
    expect(() => make(f, { tenantId: '' })).toThrow();
    expect(() => make(f, { url: 'http://localhost:3000/api/revalidate' })).not.toThrow();
  });
});
