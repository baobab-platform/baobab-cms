import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { SignedEstateRevalidationPublisher } from './signed-estate-publisher.js';
import { EstateDeliveryError } from '../outbox/estate-delivery.js';
import type { CanonicalEventEnvelope } from './types.js';

const secret = 'a-strong-estate-specific-hmac-secret-value';
const envelope: CanonicalEventEnvelope = {
  eventId: 'event-1', eventType: 'content.published', eventVersion: 1,
  occurredAt: '2026-11-09T00:00:00Z', sourceEngine: 'CONTENT',
  canonicalEntityId: 'canonical-1', canonicalEntityType: 'PAGE',
  tenantId: 'tenant-a', digitalEstateId: 'estate-a', correlationId: 'corr-1',
  payload: { collection: 'pages', slug: 'home', contentKey: 'home', secretContent: 'do-not-include' },
};

const adapter = (fetchImpl: typeof fetch, options: Record<string, unknown> = {}) =>
  new SignedEstateRevalidationPublisher({
    tenantId: 'tenant-a', digitalEstateId: 'estate-a', url: 'https://estate.example.org/revalidate',
    secret, fetchImpl, ...options,
  });

describe('signed per-destination revalidation acknowledgments — ADR-0018/0021', () => {
  it('signs timestamp and narrow content payload and requires a matching explicit receipt', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 204, headers: { 'x-baobab-ack-event-id': 'event-1' },
    })) as unknown as typeof fetch;
    const ack = await adapter(fetchImpl).deliver(envelope);
    expect(ack).toEqual({ kind: 'SIGNED_HTTP', code: 204, reference: 'event-1' });
    const [, init] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.redirect).toBe('error');
    const body = String(init.body);
    const parsed = JSON.parse(body);
    expect(parsed).toMatchObject({ schema: 'baobab.cms.revalidation.v1', eventId: 'event-1', tenantId: 'tenant-a' });
    expect(parsed.content).toEqual({ collection: 'pages', contentKey: 'home', slug: 'home' });
    expect(body).not.toContain('do-not-include');
    const h = init.headers as Record<string, string>;
    const expected = createHmac('sha256', secret).update(`${h['x-baobab-timestamp']}.${body}`).digest('hex');
    expect(h['x-baobab-signature']).toBe(expected);
    expect(h['idempotency-key']).toBe('event-1');
  });

  it('rejects unbound tenant/estate without accessing the destination', async () => {
    const f = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch;
    await expect(adapter(f).deliver({ ...envelope, tenantId: 'other' })).rejects.toMatchObject({ permanent: true });
    await expect(adapter(f).deliver({ ...envelope, digitalEstateId: 'estate-b' })).rejects.toMatchObject({ permanent: true });
    expect(f).not.toHaveBeenCalled();
  });

  it('will not store success for a bare 2xx or a different event ID', async () => {
    for (const echoed of [null, 'event-2']) {
      const f = (async () => new Response(null, {
        status: 204, headers: echoed ? { 'x-baobab-ack-event-id': echoed } : {},
      })) as unknown as typeof fetch;
      const err = await adapter(f).deliver(envelope).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(EstateDeliveryError);
      expect(err).toMatchObject({ reason: 'DESTINATION_ACK_EVENT_MISMATCH', permanent: false });
    }
  });

  it('retries 503 and terminally rejects 401 without storing a fake delivery receipt', async () => {
    for (const [status, permanent] of [[503, false], [429, false], [401, true], [404, true]] as const) {
      const f = (async () => new Response(null, { status })) as unknown as typeof fetch;
      await expect(adapter(f).deliver(envelope)).rejects.toMatchObject({ permanent });
    }
  });

  it('redacts transport failures and refuses unsafe endpoints', async () => {
    const f = (async () => { throw new Error(`private ${secret} secret URL`); }) as unknown as typeof fetch;
    const err = await adapter(f).deliver(envelope).catch((e: unknown) => e) as Error;
    expect(err.message).toBe('DESTINATION_TRANSPORT_FAILURE');
    expect(err.message).not.toContain(secret);
    for (const url of ['http://external.example.org/x', 'https://127.0.0.1/x', 'https://user:pass@estate.example.org/x']) {
      expect(() => adapter(f, { url })).toThrow();
    }
  });
});
