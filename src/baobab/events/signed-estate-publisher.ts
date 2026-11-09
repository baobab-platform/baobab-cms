import { createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import type { CanonicalEventEnvelope } from './types.js';
import { EstateDeliveryError, type EstateDeliveryPublisher, type EstateAcknowledgment } from '../outbox/estate-delivery.js';

export interface SignedEstateConfig {
  tenantId: string;
  digitalEstateId: string;
  url: string;
  secret: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
  /** Disposable local integration testing only, never for production. */
  allowLoopbackInDevelopment?: boolean;
}

function validateDestination(config: SignedEstateConfig): void {
  if (!config.tenantId || !config.digitalEstateId || config.secret.length < 24) {
    throw new Error('Signed estate delivery needs a tenant, estate and strong scoped secret');
  }
  const u = new URL(config.url);
  if (u.username || u.password || u.hash) throw new Error('Signed estate URL may not contain credentials or fragments');
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  const loopback = host === 'localhost' || host === '127.0.0.1' || host === '[::1]';
  if (loopback && config.allowLoopbackInDevelopment === true && process.env.NODE_ENV !== 'production') {
    if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Invalid local estate protocol');
    return;
  }
  if (u.protocol !== 'https:' || loopback || host.endsWith('.localhost') ||
      host.endsWith('.local') || host.endsWith('.internal') ||
      isIP(host.replace(/^\[/, '').replace(/\]$/, '')) !== 0) {
    throw new Error('Signed estate delivery requires an approved public HTTPS destination');
  }
}

/**
 * Generic, signed, estate-bound webhook adapter. Its 2xx receipt is a delivery
 * acknowledgment only: verifying browser/CDN cache freshness is a separate
 * ADR-0021 acceptance gate. The destination must echo the event ID in a
 * response header so an unrelated 2xx cannot be accepted as a receipt.
 */
export class SignedEstateRevalidationPublisher implements EstateDeliveryPublisher {
  private readonly send: typeof fetch;
  constructor(private readonly config: SignedEstateConfig) {
    validateDestination(config);
    this.send = config.fetchImpl ?? fetch;
  }

  async deliver(envelope: CanonicalEventEnvelope): Promise<EstateAcknowledgment> {
    if (envelope.tenantId !== this.config.tenantId ||
        envelope.digitalEstateId !== this.config.digitalEstateId ||
        typeof envelope.eventId !== 'string' || !envelope.eventId ||
        !envelope.eventType.startsWith('content.')) {
      throw new EstateDeliveryError('CANONICAL_ENVELOPE_SCOPE_MISMATCH', true);
    }
    const eventPayload = envelope.payload as Record<string, unknown> | null;
    const content: Record<string, string> = {};
    for (const key of ['collection', 'contentKey', 'slug']) {
      if (typeof eventPayload?.[key] === 'string') content[key] = eventPayload[key] as string;
    }
    const body = JSON.stringify({
      schema: 'baobab.cms.revalidation.v1',
      eventId: envelope.eventId,
      eventType: envelope.eventType,
      tenantId: envelope.tenantId,
      digitalEstateId: envelope.digitalEstateId,
      canonicalEntityId: envelope.canonicalEntityId,
      correlationId: envelope.correlationId,
      content,
    });
    const timestamp = String(Date.now());
    const signature = createHmac('sha256', this.config.secret)
      .update(`${timestamp}.${body}`).digest('hex');

    let response: Response;
    try {
      response = await this.send(this.config.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-baobab-timestamp': timestamp,
          'x-baobab-signature': signature,
          'idempotency-key': envelope.eventId,
          'x-correlation-id': envelope.correlationId,
        },
        body,
        redirect: 'error',
        signal: AbortSignal.timeout(this.config.timeoutMs ?? 5000),
      });
    } catch {
      // Network errors may include endpoint URL/credentials: never propagate.
      throw new EstateDeliveryError('DESTINATION_TRANSPORT_FAILURE', false);
    }
    if (!response.ok) {
      const permanent = response.status >= 300 && response.status < 500 &&
        response.status !== 408 && response.status !== 425 && response.status !== 429;
      throw new EstateDeliveryError(`DESTINATION_HTTP_${response.status}`, permanent);
    }
    if (response.headers.get('x-baobab-ack-event-id') !== envelope.eventId) {
      throw new EstateDeliveryError('DESTINATION_ACK_EVENT_MISMATCH', false);
    }
    return { kind: 'SIGNED_HTTP', code: response.status, reference: envelope.eventId };
  }
}
