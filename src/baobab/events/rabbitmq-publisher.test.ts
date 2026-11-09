import { beforeEach, describe, expect, it, vi } from 'vitest';
import amqp from 'amqplib';
import { RabbitMqEventPublisher } from './rabbitmq-publisher.js';
import type { CanonicalEventEnvelope } from './types.js';

vi.mock('amqplib', () => ({ default: { connect: vi.fn() } }));

const envelope: CanonicalEventEnvelope = {
  eventId: 'event-confirm-1',
  eventType: 'content.published',
  eventVersion: 1,
  occurredAt: '2026-11-09T00:00:00Z',
  sourceEngine: 'CONTENT',
  canonicalEntityId: 'cms-canonical-1',
  canonicalEntityType: 'PAGE',
  tenantId: 'tenant-a',
  correlationId: 'corr-1',
  payload: {},
};

function arrangeBroker(confirmation: () => Promise<void>) {
  const calls: string[] = [];
  const channel = {
    assertQueue: vi.fn(async () => { calls.push('assertQueue'); }),
    sendToQueue: vi.fn(() => { calls.push('sendToQueue'); return true; }),
    waitForConfirms: vi.fn(async () => { calls.push('confirm'); await confirmation(); }),
    close: vi.fn(async () => { calls.push('channelClose'); }),
  };
  const connection = {
    createConfirmChannel: vi.fn(async () => { calls.push('confirmChannel'); return channel; }),
    close: vi.fn(async () => { calls.push('connectionClose'); }),
  };
  vi.mocked(amqp.connect).mockResolvedValue(connection as never);
  return { channel, connection, calls };
}

describe('ADR-0018 RabbitMQ canonical event acknowledgements', () => {
  beforeEach(() => vi.resetAllMocks());

  it('requires a durable queue and publisher confirmation before successful return', async () => {
    const broker = arrangeBroker(async () => undefined);
    await new RabbitMqEventPublisher('amqp://local', 'events.q').publish(envelope);
    expect(broker.channel.assertQueue).toHaveBeenCalledWith('events.q', { durable: true });
    const [, encoded, properties] = broker.channel.sendToQueue.mock.calls[0] as unknown as [string, Buffer, Record<string, unknown>];
    expect(JSON.parse(encoded.toString())).toEqual(envelope);
    expect(properties).toMatchObject({ persistent: true, messageId: envelope.eventId });
    expect(broker.calls).toEqual(['confirmChannel', 'assertQueue', 'sendToQueue', 'confirm', 'channelClose', 'connectionClose']);
  });

  it('rejects broker negative confirmation so the outbox remains due for retry', async () => {
    const broker = arrangeBroker(async () => { throw new Error('broker nacked the event'); });
    await expect(new RabbitMqEventPublisher('amqp://local', 'events.q').publish(envelope)).rejects.toThrow('broker nacked');
    expect(broker.channel.waitForConfirms).toHaveBeenCalledOnce();
    expect(broker.connection.close).toHaveBeenCalledOnce();
  });

  it('rejects an unbound event before opening a connection', async () => {
    await expect(new RabbitMqEventPublisher('amqp://local', 'events.q').publish({ ...envelope, tenantId: '' }))
      .rejects.toMatchObject({ permanent: true });
    expect(amqp.connect).not.toHaveBeenCalled();
  });
});
