import { describe, expect, it } from 'vitest';
import type { Payload } from 'payload';
import { runOutboxDispatchCycle } from './dispatcher.js';
import { OutboxStatus } from './types.js';
import type { EventPublisher } from '../events/publisher.js';
import type { CanonicalEventEnvelope } from '../events/types.js';

interface FakeDoc {
  id: string;
  status: string;
  attemptCount: number;
  nextAttemptAt?: string;
  envelope: CanonicalEventEnvelope;
  publishedAt?: string;
  lastError?: string;
}

/**
 * Minimal in-memory stand-in for the subset of the Payload local API the
 * dispatcher uses. This is a behavioural contract test of
 * `runOutboxDispatchCycle`, not a test of Payload's own query engine.
 */
function makeFakePayload(docs: FakeDoc[], now: Date) {
  return {
    async find() {
      const due = docs.filter(
        (d) => d.status === OutboxStatus.PENDING || (d.status === OutboxStatus.FAILED_RETRYABLE && (!d.nextAttemptAt || Date.parse(d.nextAttemptAt) <= now.getTime())),
      );
      return { docs: due };
    },
    async update({ id, data }: { id: string; data: Partial<FakeDoc> }) {
      const doc = docs.find((d) => d.id === id);
      if (!doc) throw new Error('not found');
      Object.assign(doc, data);
      return doc;
    },
  } as unknown as Payload;
}

function envelope(id: string): CanonicalEventEnvelope {
  return {
    eventId: id,
    eventType: 'content.updated',
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    sourceEngine: 'CONTENT',
    canonicalEntityId: 'canonical-1',
    canonicalEntityType: 'PAGE',
    tenantId: 'tenant-a',
    correlationId: 'corr-1',
    payload: {},
  };
}

class AlwaysSucceedsPublisher implements EventPublisher {
  published: CanonicalEventEnvelope[] = [];
  async publish(env: CanonicalEventEnvelope): Promise<void> {
    this.published.push(env);
  }
}

class AlwaysFailsPublisher implements EventPublisher {
  async publish(): Promise<void> {
    throw new Error('transport unavailable');
  }
}

describe('runOutboxDispatchCycle — ADR-0018 CT-003/CT-004/CT-006/CT-007', () => {
  it('publishes a pending entry and marks it PUBLISHED', async () => {
    const docs: FakeDoc[] = [{ id: '1', status: OutboxStatus.PENDING, attemptCount: 0, envelope: envelope('e1') }];
    const now = new Date();
    const payload = makeFakePayload(docs, now);
    const publisher = new AlwaysSucceedsPublisher();

    const result = await runOutboxDispatchCycle({ payload, publisher, now });

    expect(result.published).toBe(1);
    expect(docs[0].status).toBe(OutboxStatus.PUBLISHED);
    expect(docs[0].publishedAt).toBeTruthy();
    expect(publisher.published).toHaveLength(1);
  });

  it('retries a transient failure with a bounded backoff instead of dropping it', async () => {
    const docs: FakeDoc[] = [{ id: '1', status: OutboxStatus.PENDING, attemptCount: 0, envelope: envelope('e1') }];
    const now = new Date();
    const payload = makeFakePayload(docs, now);
    const publisher = new AlwaysFailsPublisher();

    const result = await runOutboxDispatchCycle({ payload, publisher, now });

    expect(result.retried).toBe(1);
    expect(docs[0].status).toBe(OutboxStatus.FAILED_RETRYABLE);
    expect(docs[0].attemptCount).toBe(1);
    expect(docs[0].nextAttemptAt).toBeTruthy();
  });

  it('moves a persistently failing entry to FAILED_TERMINAL rather than retrying forever', async () => {
    const docs: FakeDoc[] = [
      { id: '1', status: OutboxStatus.PENDING, attemptCount: 7, envelope: envelope('e1') },
    ];
    const now = new Date();
    const payload = makeFakePayload(docs, now);
    const publisher = new AlwaysFailsPublisher();

    const result = await runOutboxDispatchCycle({ payload, publisher, now, retryPolicy: { maxAttempts: 8, baseDelayMs: 10, maxDelayMs: 100 } });

    expect(result.deadLettered).toBe(1);
    expect(docs[0].status).toBe(OutboxStatus.FAILED_TERMINAL);
  });

  it('does not re-process an entry whose retry is not yet due', async () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    const docs: FakeDoc[] = [
      { id: '1', status: OutboxStatus.FAILED_RETRYABLE, attemptCount: 1, nextAttemptAt: future, envelope: envelope('e1') },
    ];
    const now = new Date();
    const payload = makeFakePayload(docs, now);
    const publisher = new AlwaysSucceedsPublisher();

    const result = await runOutboxDispatchCycle({ payload, publisher, now });

    expect(result.processed).toBe(0);
    expect(docs[0].status).toBe(OutboxStatus.FAILED_RETRYABLE);
  });

  it('dead-letters a permanent failure at once instead of retrying', async () => {
    const docs: FakeDoc[] = [{ id: '1', status: OutboxStatus.PENDING, attemptCount: 0, envelope: envelope('e1') }];
    const now = new Date();
    const publisher: EventPublisher = {
      async publish() {
        throw Object.assign(new Error('revalidate responded 401'), { permanent: true });
      },
    };
    const result = await runOutboxDispatchCycle({ payload: makeFakePayload(docs, now), publisher, now });
    expect(result.deadLettered).toBe(1);
    expect(docs[0].status).toBe(OutboxStatus.FAILED_TERMINAL);
    expect(docs[0].lastError).toBe('revalidate responded 401');
  });

  it('asks for stale PUBLISHING entries so a crashed worker does not strand them', async () => {
    let where: unknown;
    const payload = {
      async find(args: { where: unknown }) {
        where = args.where;
        return { docs: [] };
      },
    } as unknown as Payload;
    const now = new Date('2026-10-09T12:00:00Z');
    await runOutboxDispatchCycle({ payload, publisher: new AlwaysSucceedsPublisher(), now, publishingLeaseMs: 60_000 });
    const text = JSON.stringify(where);
    expect(text).toContain('PUBLISHING');
    expect(text).toContain('2026-10-09T11:59:00.000Z');
  });
});
