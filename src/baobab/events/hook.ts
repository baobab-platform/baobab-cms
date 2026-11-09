import type { CollectionAfterChangeHook, CollectionAfterDeleteHook } from 'payload';
import { tryResolveContext } from '../context/resolve.js';
import { extractRelationId } from '../util/relation.js';
import { enqueueOutboxEvent } from '../outbox/enqueue.js';
import { buildCanonicalEvent } from './build-envelope.js';
import type { CanonicalEventType } from './types.js';

type DocLike = Record<string, unknown> & { id: string | number; canonicalEntityId?: string };

export interface CanonicalEventHookOptions<T extends DocLike = DocLike> {
  canonicalEntityType: string;
  eventTypeFor: (
    operation: 'create' | 'update' | 'delete',
    doc: T,
    previousDoc: T | undefined,
  ) => CanonicalEventType | string | null;
  buildPayload?: (doc: T) => Record<string, unknown>;
}

async function enqueueForDoc<T extends DocLike>(
  options: CanonicalEventHookOptions<T>,
  operation: 'create' | 'update' | 'delete',
  doc: T,
  previousDoc: T | undefined,
  req: Parameters<CollectionAfterChangeHook>[0]['req'],
): Promise<void> {
  const eventType = options.eventTypeFor(operation, doc, previousDoc);
  if (!eventType) return;

  const tenantId = extractRelationId(doc.tenant);
  if (!tenantId) {
    // An editorial mutation without a durable event is not a success.
    throw new Error(`Cannot enqueue ${eventType}: missing canonical tenant on ${options.canonicalEntityType}`);
  }
  // Media uses canonicalMediaId (ADR-0016); all other editorial
  // collections use canonicalEntityId. Payload-local ids are NEVER
  // substitutes for cross-engine canonical identity.
  const canonicalEntityId = doc.canonicalEntityId ||
    (typeof doc.canonicalMediaId === 'string' ? doc.canonicalMediaId : undefined);
  if (!canonicalEntityId) {
    throw new Error(`Cannot enqueue ${eventType}: missing canonical entity identity on ${options.canonicalEntityType}`);
  }

  const context = tryResolveContext(req);

  const envelope = buildCanonicalEvent({
    eventType,
    canonicalEntityId,
    canonicalEntityType: options.canonicalEntityType,
    tenantId,
    legalEntityId: extractRelationId(doc.legalEntity),
    digitalEstateId: extractRelationId(doc.digitalEstate),
    marketId: extractRelationId(doc.market),
    locale: typeof doc.locale === 'string' ? doc.locale : undefined,
    correlationId: context?.correlationId ?? crypto.randomUUID(),
    externalReference: {
      engine: 'PAYLOAD',
      engineInstanceId: process.env.BAOBAB_ENGINE_INSTANCE_ID || 'local-dev',
      externalType: options.canonicalEntityType.toLowerCase(),
      externalId: String(doc.id),
    },
    payload: options.buildPayload ? options.buildPayload(doc) : { id: doc.id },
  });

  await enqueueOutboxEvent({ req, envelope });
}

/**
 * Replaces direct synchronous event publication from Payload hooks
 * (ADR-0018 §61-63). The hook only ever writes a durable outbox intent in
 * the same transaction — it never calls the network.
 */
export function canonicalAfterChangeHook<T extends DocLike = DocLike>(
  options: CanonicalEventHookOptions<T>,
): CollectionAfterChangeHook<T> {
  // Deliberately does not catch: the outbox insert is a local, durable
  // write that SHOULD join the same transaction as the content mutation
  // (ADR-0018 §30-32). Swallowing a failure here would silently break the
  // "content committed + event intent committed together" invariant.
  return async ({ doc, previousDoc, operation, req }) => {
    await enqueueForDoc(options, operation, doc, previousDoc, req);
    return doc;
  };
}

export function canonicalAfterDeleteHook<T extends DocLike = DocLike>(
  options: CanonicalEventHookOptions<T>,
): CollectionAfterDeleteHook<T> {
  return async ({ doc, req }) => {
    await enqueueForDoc(options, 'delete', doc, undefined, req);
    return doc;
  };
}
