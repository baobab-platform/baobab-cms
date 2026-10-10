/**
 * Canonical event type vocabulary (ADR-0018 §6-10, ADR-0011 §17). Payload
 * hook names (`afterChange`, collection slugs) are internal implementation
 * detail and SHALL NOT leak into this vocabulary (ADR-0018 §4, §13-14).
 *
 * This is the local implementation of what `baobab-platform/shared` would
 * otherwise govern centrally; see `docs/architecture/events.md` for the
 * documented swap-in point once that repository exists.
 */
export const CanonicalEventType = {
  CONTENT_CREATED: 'content.created',
  CONTENT_UPDATED: 'content.updated',
  CONTENT_PUBLISHED: 'content.published',
  CONTENT_UNPUBLISHED: 'content.unpublished',
  CONTENT_ARCHIVED: 'content.archived',
  CONTENT_RETIRED: 'content.retired',

  MEDIA_CREATED: 'media.created',
  MEDIA_UPDATED: 'media.updated',
  MEDIA_PUBLISHED: 'media.published',
  MEDIA_QUARANTINED: 'media.quarantined',
  MEDIA_RETIRED: 'media.retired',

  NAVIGATION_UPDATED: 'navigation.updated',

  PRODUCT_CONTENT_CREATED: 'content.product.created',
  PRODUCT_CONTENT_UPDATED: 'content.product.updated',
  PRODUCT_CONTENT_PUBLISHED: 'content.product.published',
  PRODUCT_CONTENT_UNPUBLISHED: 'content.product.unpublished',
} as const;

export type CanonicalEventType = (typeof CanonicalEventType)[keyof typeof CanonicalEventType];

export const SOURCE_ENGINE = 'CONTENT' as const;

export interface CanonicalEventEnvelope<TPayload = Record<string, unknown>> {
  eventId: string;
  eventType: CanonicalEventType | string;
  eventVersion: number;
  occurredAt: string;
  sourceEngine: typeof SOURCE_ENGINE;
  sourceEngineInstance?: string;
  canonicalEntityId: string;
  canonicalEntityType: string;
  tenantId: string;
  legalEntityId?: string;
  digitalEstateId?: string;
  marketId?: string;
  locale?: string;
  correlationId: string;
  causationId?: string;
  traceId?: string;
  /** External-reference diagnostics only — never canonical identity (ADR-0013 §47). */
  externalReference?: {
    engine: string;
    engineInstanceId: string;
    externalType: string;
    externalId: string;
  };
  payload: TPayload;
}
