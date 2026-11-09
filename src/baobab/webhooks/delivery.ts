import { isIP } from 'node:net';
import { signWebhookPayload } from './signing.js';

export class WebhookEndpointRejectedError extends Error {
  constructor(reason: string) {
    super(`Webhook endpoint rejected: ${reason}`);
    this.name = 'WebhookEndpointRejectedError';
  }
}

const BLOCKED_HOSTNAMES = new Set(['localhost', '0.0.0.0', '169.254.169.254']);

/**
 * Minimal SSRF guard (ADR-0018 §59). Rejects obviously internal/link-local
 * targets before a webhook is ever dispatched. This is defence in depth,
 * not a substitute for network-level egress policy or DNS rebinding protection.
 */
export function assertSafeWebhookUrl(rawUrl: string): URL {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new WebhookEndpointRejectedError('invalid URL');
  }

  if (url.protocol !== 'https:') {
    throw new WebhookEndpointRejectedError('only https:// endpoints are permitted');
  }

  if (url.username || url.password) {
    throw new WebhookEndpointRejectedError('credentials in endpoint URL are prohibited');
  }
  if (url.hash) {
    throw new WebhookEndpointRejectedError('URL fragments are not valid webhook destinations');
  }
  // Strip a terminal DNS dot before checking local-hostname policy.
  // IP literals are blocked: IPv6 and mapped IPv4 variants otherwise evade
  // naive private IPv4 checks. Approved endpoints must use a DNS name,
  // while network egress policy still independently validates resolved IPs.
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  const ipCandidate = hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1) : hostname;
  if (isIP(ipCandidate)) {
    throw new WebhookEndpointRejectedError('IP-literal webhook hosts are not permitted');
  }
  if (hostname === 'localhost' || hostname.endsWith('.localhost')) {
    throw new WebhookEndpointRejectedError('localhost destinations are not permitted');
  }
  if (BLOCKED_HOSTNAMES.has(hostname)) {
    throw new WebhookEndpointRejectedError(`"${hostname}" is not a permitted webhook destination`);
  }
  if (hostname.endsWith('.internal') || hostname.endsWith('.local')) {
    throw new WebhookEndpointRejectedError(`"${hostname}" resolves to an internal-looking domain`);
  }
  if (/^127\./.test(hostname) || /^10\./.test(hostname) || /^192\.168\./.test(hostname) || /^169\.254\./.test(hostname)) {
    throw new WebhookEndpointRejectedError(`"${hostname}" is a private/link-local address`);
  }
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(hostname)) {
    throw new WebhookEndpointRejectedError(`"${hostname}" is a private address`);
  }

  return url;
}

export interface DeliverWebhookParams {
  url: string;
  secret: string;
  body: unknown;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export interface WebhookDeliveryResult {
  delivered: boolean;
  status?: number;
  error?: string;
}

/**
 * Delivers one webhook with a bounded timeout so a slow endpoint never
 * blocks the editorial transaction (ADR-0018 §58, §63, CT-010). This is
 * called only from the async outbox path, never from a synchronous hook.
 */
export async function deliverWebhook(params: DeliverWebhookParams): Promise<WebhookDeliveryResult> {
  const { url, secret, body, timeoutMs = 5000, fetchImpl = fetch } = params;
  const safeUrl = assertSafeWebhookUrl(url);

  const payloadBody = JSON.stringify(body);
  const signature = signWebhookPayload(secret, payloadBody);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetchImpl(safeUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-baobab-signature': signature,
      },
      // Redirect targets do not inherit the original destination's approval.
      // Following 30x automatically can forward a signed payload to intranet.
      redirect: 'error',
      body: payloadBody,
      signal: controller.signal,
    });
    return { delivered: response.ok, status: response.status };
  } catch {
    // Do not propagate Fetch errors containing the destination URL, signed
    // payload or tokens into the outbox, logs or response objects.
    return { delivered: false, error: 'webhook delivery failed (network, timeout or redirect)' };
  } finally {
    clearTimeout(timeout);
  }
}
