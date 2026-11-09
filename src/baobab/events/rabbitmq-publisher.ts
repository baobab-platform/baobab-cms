import amqp from 'amqplib';
import type { EventPublisher } from './publisher.js';
import type { CanonicalEventEnvelope } from './types.js';

/**
 * ADR-0018: durable canonical event publication from the transactional
 * outbox. A successful TCP write / sendToQueue() is NOT broker acceptance.
 * Only a RabbitMQ publisher confirmation permits marking an outbox row
 * PUBLISHED. Negative confirmations or lost connections cause a retry of
 * the original, immutable eventId (at-least-once delivery).
 */
export class RabbitMqEventPublisher implements EventPublisher {
  private readonly connectionUrl: string;
  private readonly queueName: string;

  constructor(
    connectionUrl = process.env.RABBITMQ_URL || 'amqp://guest:guest@localhost:5672',
    queueName = process.env.BAOBAB_EVENTS_QUEUE || 'baobab.canonical-events',
  ) {
    this.connectionUrl = connectionUrl;
    this.queueName = queueName;
  }

  async publish(envelope: CanonicalEventEnvelope): Promise<void> {
    if (!envelope.eventId || !envelope.tenantId || !envelope.canonicalEntityId) {
      throw Object.assign(new Error('Invalid canonical event identity/context'), { permanent: true });
    }
    const connection = await amqp.connect(this.connectionUrl);
    try {
      const channel = await connection.createConfirmChannel();
      try {
        await channel.assertQueue(this.queueName, { durable: true });
        channel.sendToQueue(this.queueName, Buffer.from(JSON.stringify(envelope)), {
          persistent: true,
          messageId: envelope.eventId,
          contentType: 'application/json',
          headers: { 'x-baobab-tenant-id': envelope.tenantId },
        });
        // Resolves only after RabbitMQ confirms the persistent publication.
        // If confirm is lost after accept, retry may deliver a duplicate;
        // consumer deduplication by eventId is mandatory.
        await channel.waitForConfirms();
      } finally {
        await channel.close();
      }
    } finally {
      await connection.close();
    }
  }
}
