import type { Payload, Where } from 'payload';
import type { EventPublisher } from '../events/publisher.js';
import type { CanonicalEventEnvelope } from '../events/types.js';
import { computeBackoffMs, decideFailureOutcome, DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry.js';
import { OutboxStatus } from './types.js';

export interface RunOutboxDispatchCycleParams {
  payload: Payload;
  publisher: EventPublisher;
  batchSize?: number;
  retryPolicy?: RetryPolicy;
  now?: Date;
  /**
   * An entry left in PUBLISHING longer than this is assumed to belong to a crashed worker and becomes due again.
   * Delivery is at-least-once and consumers are idempotent (ADR-0018 §38-41).
   */
  publishingLeaseMs?: number;
  /** Optional authorised tenant partition; required for estate-specific workers. */
  tenantId?: string;
}

export interface OutboxDispatchCycleResult {
  processed: number;
  published: number;
  retried: number;
  deadLettered: number;
}

interface OutboxDoc {
  id: string;
  eventId?: string;
  tenant?: string;
  envelope: CanonicalEventEnvelope;
  attemptCount?: number;
}

/**
 * Drains due outbox entries and publishes them (ADR-0018 §34-37, §102).
 * Safe to call repeatedly / after a crash: PUBLISHING is set immediately
 * before the network call so a crashed worker's entries are visible for
 * operator inspection, and duplicate delivery on retry is an accepted,
 * documented outcome — consumers are required to be idempotent
 * (ADR-0018 §38-41, §103).
 */
export async function runOutboxDispatchCycle(params: RunOutboxDispatchCycleParams): Promise<OutboxDispatchCycleResult> {
  const { payload, publisher, batchSize = 25, retryPolicy = DEFAULT_RETRY_POLICY } = params;
  const now = params.now ?? new Date();
  const staleBefore = new Date(now.getTime() - (params.publishingLeaseMs ?? 5 * 60 * 1000)).toISOString();
  if (params.tenantId !== undefined && params.tenantId.trim() === '') {
    throw new Error('A tenant-scoped dispatch cannot use an empty tenant id');
  }
  const dueWhere: Where = {
    or: [
      { status: { equals: OutboxStatus.PENDING } },
      { and: [{ status: { equals: OutboxStatus.PUBLISHING } }, { updatedAt: { less_than: staleBefore } }] },
      {
        and: [
          { status: { equals: OutboxStatus.FAILED_RETRYABLE } },
          { nextAttemptAt: { less_than_equal: now.toISOString() } },
        ],
      },
    ],
  };

  const due = await payload.find({
    collection: 'outbox',
    where: params.tenantId ? { and: [{ tenant: { equals: params.tenantId } }, dueWhere] } : dueWhere,
    limit: batchSize,
    sort: 'createdAt',
    depth: 0,
    overrideAccess: true,
  });

  const result: OutboxDispatchCycleResult = { processed: 0, published: 0, retried: 0, deadLettered: 0 };

  for (const doc of due.docs as unknown as OutboxDoc[]) {
    result.processed += 1;

    // A malformed row must not be acknowledged by the wrong tenant/worker.
    // Do not permit a source-field/envelope mismatch to escape inspection.
    // This is an additional check; query partitioning is the primary filter.
    await payload.update({ collection: 'outbox', id: doc.id, data: { status: OutboxStatus.PUBLISHING }, overrideAccess: true });

    try {
      if (!doc.envelope || typeof doc.envelope.eventId !== 'string' ||
          typeof doc.envelope.tenantId !== 'string' || !doc.envelope.tenantId ||
          (doc.eventId !== undefined && doc.eventId !== doc.envelope.eventId) ||
          (doc.tenant !== undefined && doc.tenant !== doc.envelope.tenantId) ||
          (params.tenantId !== undefined && doc.envelope.tenantId !== params.tenantId)) {
        throw Object.assign(new Error('Outbox identity/tenant integrity mismatch'), { permanent: true });
      }
      await publisher.publish(doc.envelope);
      await payload.update({
        collection: 'outbox',
        id: doc.id,
        data: { status: OutboxStatus.PUBLISHED, publishedAt: new Date().toISOString() },
        overrideAccess: true,
      });
      result.published += 1;
    } catch (error) {
      const attemptCount = (doc.attemptCount ?? 0) + 1;
      const permanent = (error as { permanent?: unknown } | null)?.permanent === true;
      const outcome = permanent ? OutboxStatus.FAILED_TERMINAL : decideFailureOutcome(attemptCount, retryPolicy);
      const nextAttemptAt =
        outcome === 'FAILED_RETRYABLE'
          ? new Date(now.getTime() + computeBackoffMs(attemptCount, retryPolicy)).toISOString()
          : undefined;

      await payload.update({
        collection: 'outbox',
        id: doc.id,
        data: {
          status: outcome,
          attemptCount,
          nextAttemptAt,
          lastError: error instanceof Error ? error.message : 'Publisher failed',
        },
        overrideAccess: true,
      });

      if (outcome === 'FAILED_TERMINAL') result.deadLettered += 1;
      else result.retried += 1;
    }
  }

  return result;
}
