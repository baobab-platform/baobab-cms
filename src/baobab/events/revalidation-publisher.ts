import type { CanonicalEventEnvelope } from './types.js';
import type { EventPublisher } from './publisher.js';

/**
 * Delivers content-change events to the Nabhold estate's authenticated
 * `POST /api/revalidate` so its cache refreshes (estate ADR-0002 §10-11).
 *
 * Only the narrow request the estate accepts is sent: a collection plus a slug
 * or one of the five singleton content keys. No content is sent, so a leaked
 * request reveals nothing about the change beyond what is being refreshed.
 *
 * - Scoped: only events for the configured tenant are delivered; others are
 *   ignored as successful no-ops (they are not this estate's business).
 * - Idempotent: revalidating twice is harmless. The event id is sent as an
 *   Idempotency-Key for diagnostics.
 * - Failure classes: network, timeout, 429, 5xx are retryable. 400, 401, 403
 *   and 404 will not heal by retrying and are marked permanent so they reach
 *   the dead-letter state at once. The estate answering 503 "not configured"
 *   is retryable because configuration can be fixed.
 * - The bearer secret and URL never appear in an error message or a log.
 */

export class RevalidationDeliveryError extends Error {
  constructor(
    message: string,
    readonly permanent: boolean,
  ) {
    super(message);
    this.name = 'RevalidationDeliveryError';
  }
}

export interface RevalidationConfig {
  /** Full URL of the estate's revalidate endpoint. https, except localhost for development. */
  url: string;
  secret: string;
  /** CMS tenant id whose events belong to this estate. */
  tenantId: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export type RevalidateRequestBody =
  | { collection: 'portfolio-companies' | 'sectors' | 'insights'; slug: string }
  | { collection: 'pages'; contentKey: 'home' | 'navigation' | 'footer' | 'site-settings' | 'group-profile' };

const SINGLETON_KEYS = ['home', 'navigation', 'footer', 'site-settings', 'group-profile'] as const;
const SLUG_COLLECTIONS = ['portfolio-companies', 'sectors', 'insights'] as const;
const CONTENT_EVENT = /^content\.(created|updated|published|unpublished|archived|retired)$/;

/** Maps an event to the estate's request, or null when it is not something the estate caches. */
export function toRevalidateRequest(envelope: CanonicalEventEnvelope): RevalidateRequestBody | null {
  if (!CONTENT_EVENT.test(String(envelope.eventType))) return null;
  const payload = envelope.payload as { collection?: unknown; slug?: unknown; contentKey?: unknown };

  if (payload.collection === 'pages' || payload.collection === 'site-configurations') {
    const key = SINGLETON_KEYS.find((k) => k === payload.contentKey);
    return key ? { collection: 'pages', contentKey: key } : null;
  }
  const collection = SLUG_COLLECTIONS.find((c) => c === payload.collection);
  if (collection && typeof payload.slug === 'string' && payload.slug.length > 0) return { collection, slug: payload.slug };
  return null;
}

function assertSafeUrl(url: string): void {
  const parsed = new URL(url);
  const local = parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  if (parsed.protocol !== 'https:' && !(parsed.protocol === 'http:' && local)) {
    throw new Error('Revalidation URL must be https (http is allowed for localhost only)');
  }
  if (parsed.username || parsed.password) throw new Error('Revalidation URL must not embed credentials');
}

export class NabholdRevalidationPublisher implements EventPublisher {
  private readonly doFetch: typeof fetch;

  constructor(private readonly config: RevalidationConfig) {
    if (!config.secret || config.secret.length < 16) throw new Error('Revalidation secret is missing or too short');
    if (!config.tenantId) throw new Error('Revalidation tenant id is required');
    assertSafeUrl(config.url);
    this.doFetch = config.fetchImpl ?? fetch;
  }

  async publish(envelope: CanonicalEventEnvelope): Promise<void> {
    if (envelope.tenantId !== this.config.tenantId) return;
    const body = toRevalidateRequest(envelope);
    if (!body) return;

    let response: Response;
    try {
      response = await this.doFetch(this.config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${this.config.secret}`,
          'idempotency-key': envelope.eventId,
          'x-correlation-id': envelope.correlationId,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 5000),
        redirect: 'error',
      });
    } catch {
      throw new RevalidationDeliveryError('revalidate request failed (network, timeout or redirect)', false);
    }

    if (response.ok) return;
    const permanent = [400, 401, 403, 404].includes(response.status);
    throw new RevalidationDeliveryError(`revalidate responded ${response.status}`, permanent);
  }
}
