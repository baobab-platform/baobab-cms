import { describe, expect, it, vi } from 'vitest';
import { assertSafeWebhookUrl, deliverWebhook, WebhookEndpointRejectedError } from './delivery.js';

describe('assertSafeWebhookUrl — SSRF guard (ADR-0018 §59)', () => {
  it('accepts a normal https endpoint', () => {
    expect(() => assertSafeWebhookUrl('https://example.com/webhook')).not.toThrow();
  });

  it('rejects non-https schemes', () => {
    expect(() => assertSafeWebhookUrl('http://example.com/webhook')).toThrow(WebhookEndpointRejectedError);
  });

  it('rejects localhost and loopback addresses', () => {
    expect(() => assertSafeWebhookUrl('https://localhost/webhook')).toThrow(WebhookEndpointRejectedError);
    expect(() => assertSafeWebhookUrl('https://127.0.0.1/webhook')).toThrow(WebhookEndpointRejectedError);
  });

  it('rejects the cloud metadata endpoint', () => {
    expect(() => assertSafeWebhookUrl('https://169.254.169.254/latest/meta-data')).toThrow(WebhookEndpointRejectedError);
  });

  it('rejects private network ranges', () => {
    expect(() => assertSafeWebhookUrl('https://10.0.0.5/webhook')).toThrow(WebhookEndpointRejectedError);
    expect(() => assertSafeWebhookUrl('https://192.168.1.5/webhook')).toThrow(WebhookEndpointRejectedError);
    expect(() => assertSafeWebhookUrl('https://172.16.0.5/webhook')).toThrow(WebhookEndpointRejectedError);
  });

  it('rejects an invalid URL outright', () => {
    expect(() => assertSafeWebhookUrl('not-a-url')).toThrow(WebhookEndpointRejectedError);
  });
});


describe('ADR-0018 outbound webhook destination trust', () => {
  it('refuses URL credentials, DNS aliases for localhost and IPv6 or mapped IPv4 literals', () => {
    for (const target of [
      'https://username:password@webhooks.example.com/receive',
      'https://localhost./webhook',
      'https://app.localhost/webhook',
      'https://[::1]/webhook',
      'https://[::ffff:127.0.0.1]/webhook',
      'https://8.8.8.8/webhook',
      'https://webhooks.example.com/receive#fragment',
    ]) {
      expect(() => assertSafeWebhookUrl(target)).toThrow(WebhookEndpointRejectedError);
    }
  });

  it('never allows fetch to follow a redirect after the original host was verified', async () => {
    const fetchImpl = vi.fn(async () => new Response(null, {
      status: 302,
      headers: { location: 'http://169.254.169.254/latest/meta-data' },
    })) as unknown as typeof fetch;
    const result = await deliverWebhook({
      url: 'https://webhooks.example.com/receive', secret: 'scoped-secret',
      body: { eventId: 'e-1' }, fetchImpl,
    });
    expect(result).toEqual({ delivered: false, status: 302 });
    const [, options] = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [URL, RequestInit];
    expect(options.redirect).toBe('error');
    expect(options.method).toBe('POST');
    expect(options.headers).toMatchObject({ 'x-baobab-signature': expect.any(String) });
  });

  it('redacts underlying transport error strings including URLs and credentials', async () => {
    const fetchImpl = (async () => {
      throw new Error('request redirect to https://private.invalid or leaked token scoped-secret');
    }) as unknown as typeof fetch;
    const result = await deliverWebhook({
      url: 'https://webhooks.example.com/receive', secret: 'scoped-secret',
      body: { eventId: 'e-1' }, fetchImpl,
    });
    expect(result.delivered).toBe(false);
    expect(result.error).toBe('webhook delivery failed (network, timeout or redirect)');
    expect(result.error).not.toContain('scoped-secret');
    expect(result.error).not.toContain('private.invalid');
  });
});
