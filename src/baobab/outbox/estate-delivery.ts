import type { PostgresAdapter } from '@payloadcms/db-postgres';
import type { CanonicalEventEnvelope } from '../events/types.js';
import { computeBackoffMs, DEFAULT_RETRY_POLICY, type RetryPolicy } from './retry.js';

/**
 * ADR-0018 destination subscriptions: a separate SQL-backed state machine
 * per (canonical event, authorised estate destination). The existing Payload
 * outbox status is reserved for RabbitMQ publisher confirmation.
 *
 * This is a SQL-managed operational schema rather than a Payload collection:
 * the single atomic UPDATE ... SKIP LOCKED claim and token-fenced completion
 * are what prevent two estate workers from acknowledging each other's work.
 */
export type DeliveryPool = Pick<PostgresAdapter['pool'], 'query'>;

export interface EstateAcknowledgment {
  kind: 'SIGNED_HTTP';
  code: number;
  reference: string;
}

export interface EstateDeliveryPublisher {
  deliver(envelope: CanonicalEventEnvelope): Promise<EstateAcknowledgment>;
}

export interface EstateDeliveryCycleParams {
  pool: DeliveryPool;
  publisher: EstateDeliveryPublisher;
  destinationKey: string;
  tenantId: string;
  digitalEstateId: string;
  endpointUrl: string;
  batchSize?: number;
  leaseMs?: number;
  retryPolicy?: RetryPolicy;
  now?: Date;
}

export interface EstateDeliveryResult {
  claimed: number;
  delivered: number;
  retried: number;
  deadLettered: number;
}

interface ClaimedDelivery {
  id: string;
  event_id: string;
  destination_key: string;
  tenant_id: string;
  digital_estate_id: string;
  claim_token: string;
  attempt_count: number;
  envelope: CanonicalEventEnvelope;
  outbox_tenant: string;
  outbox_event_id: string;
}

export class EstateDeliveryError extends Error {
  constructor(readonly reason: string, readonly permanent: boolean) {
    super(reason);
    this.name = 'EstateDeliveryError';
  }
}

function assertContext(params: EstateDeliveryCycleParams): void {
  if (![params.destinationKey, params.tenantId, params.digitalEstateId, params.endpointUrl]
    .every((part) => typeof part === 'string' && part.trim().length > 0)) {
    throw new Error('Delivery destination, tenant, estate and endpoint are required');
  }
  if (!Number.isInteger(params.batchSize ?? 10) || (params.batchSize ?? 10) < 1 || (params.batchSize ?? 10) > 100) {
    throw new Error('Invalid delivery batch size');
  }
  if (!Number.isInteger(params.leaseMs ?? 30_000) || (params.leaseMs ?? 30_000) < 10_000) {
    throw new Error('Delivery lease must be at least 10 seconds');
  }
}

function validEnvelope(row: ClaimedDelivery): boolean {
  const e = row.envelope;
  return Boolean(e && typeof e === 'object' &&
    e.eventId === row.event_id && e.eventId === row.outbox_event_id &&
    e.tenantId === row.tenant_id && e.tenantId === row.outbox_tenant &&
    e.digitalEstateId === row.digital_estate_id &&
    typeof e.canonicalEntityId === 'string' && e.canonicalEntityId &&
    typeof e.eventType === 'string' && e.eventType.startsWith('content.'));
}

async function setOutcome(params: {
  pool: DeliveryPool;
  row: ClaimedDelivery;
  status: 'DELIVERED' | 'FAILED_RETRYABLE' | 'FAILED_TERMINAL';
  now: Date;
  acknowledgment?: EstateAcknowledgment;
  nextAttempt?: Date;
  error?: string;
}): Promise<void> {
  const { row } = params;
  const r = await params.pool.query(
    `UPDATE cms_delivery.receipts
        SET status = $3, claim_token = NULL, lease_until = NULL,
            next_attempt_at = $4, acknowledged_at = $5,
            acknowledgment_kind = $6, acknowledgment_code = $7,
            acknowledgment_reference = $8, last_error = $9,
            updated_at = $10
      WHERE id = $1::uuid AND claim_token = $2::uuid AND status = 'PUBLISHING'
      RETURNING id`,
    [
      row.id, row.claim_token, params.status,
      params.nextAttempt?.toISOString() ?? null,
      params.acknowledgment ? params.now.toISOString() : null,
      params.acknowledgment?.kind ?? null,
      params.acknowledgment?.code ?? null,
      params.acknowledgment?.reference ?? null,
      params.error ?? null,
      params.now.toISOString(),
    ],
  );
  if (r.rowCount !== 1) {
    // A different worker has adopted an expired lease. Never overwrite its
    // newer receipt, even if the original remote request succeeded.
    throw new Error('ESTATE_DELIVERY_LEASE_LOST');
  }
}

export async function runEstateDeliveryCycle(params: EstateDeliveryCycleParams): Promise<EstateDeliveryResult> {
  assertContext(params);
  const { pool, publisher } = params;
  const now = params.now ?? new Date();
  const retry = params.retryPolicy ?? DEFAULT_RETRY_POLICY;

  // A caller-supplied destination key/URL is not enough to authorize routing.
  // The active binding must match all four dimensions *exactly*.
  const approved = await pool.query(
    `SELECT destination_key FROM cms_delivery.bindings
      WHERE destination_key = $1 AND tenant_id = $2 AND digital_estate_id = $3
        AND endpoint_url = $4 AND adapter = 'SIGNED_WEBHOOK' AND enabled = true`,
    [params.destinationKey, params.tenantId, params.digitalEstateId, params.endpointUrl],
  );
  if (approved.rowCount !== 1) throw new Error('Destination binding not authorised or unavailable');

  const claimed = await pool.query(
    `WITH selected AS (
        SELECT r.id
          FROM cms_delivery.receipts r
          JOIN cms_delivery.bindings b ON b.destination_key = r.destination_key
         WHERE r.destination_key = $1
           AND r.tenant_id = $2 AND r.digital_estate_id = $3
           AND b.tenant_id = $2 AND b.digital_estate_id = $3 AND b.endpoint_url = $4
           AND b.enabled = true AND b.adapter = 'SIGNED_WEBHOOK'
           AND (
             r.status = 'PENDING'
             OR (r.status = 'FAILED_RETRYABLE' AND r.next_attempt_at <= $5::timestamptz)
             OR (r.status = 'PUBLISHING' AND r.lease_until <= $5::timestamptz)
           )
         ORDER BY r.created_at, r.id
         FOR UPDATE OF r SKIP LOCKED
         LIMIT $6
       )
       UPDATE cms_delivery.receipts r
          SET status = 'PUBLISHING', claim_token = gen_random_uuid(),
              lease_until = $5::timestamptz + ($7::integer * interval '1 millisecond'),
              attempt_count = r.attempt_count + 1, updated_at = $5::timestamptz
         FROM selected s, payload.outbox o
        WHERE r.id = s.id AND o.event_id = r.event_id
       RETURNING r.id, r.event_id, r.destination_key, r.tenant_id, r.digital_estate_id,
                 r.claim_token, r.attempt_count, o.envelope,
                 o.tenant AS outbox_tenant, o.event_id AS outbox_event_id`,
    [
      params.destinationKey, params.tenantId, params.digitalEstateId, params.endpointUrl,
      now.toISOString(), params.batchSize ?? 10, params.leaseMs ?? 30_000,
    ],
  );

  const result: EstateDeliveryResult = { claimed: claimed.rowCount ?? 0, delivered: 0, retried: 0, deadLettered: 0 };
  for (const row of claimed.rows as unknown as ClaimedDelivery[]) {
    try {
      if (!validEnvelope(row)) throw new EstateDeliveryError('CANONICAL_ENVELOPE_SCOPE_MISMATCH', true);
      const acknowledgment = await publisher.deliver(row.envelope);
      if (acknowledgment.kind !== 'SIGNED_HTTP' || acknowledgment.reference !== row.event_id ||
          !Number.isInteger(acknowledgment.code) || acknowledgment.code < 200 || acknowledgment.code >= 300) {
        throw new EstateDeliveryError('INVALID_DESTINATION_ACKNOWLEDGMENT', true);
      }
      await setOutcome({ pool, row, status: 'DELIVERED', now: new Date(), acknowledgment });
      result.delivered += 1;
    } catch (error) {
      if (error instanceof Error && error.message === 'ESTATE_DELIVERY_LEASE_LOST') throw error;
      const permanent = error instanceof EstateDeliveryError && error.permanent;
      const status = permanent || row.attempt_count >= retry.maxAttempts
        ? 'FAILED_TERMINAL' as const : 'FAILED_RETRYABLE' as const;
      const delay = computeBackoffMs(row.attempt_count, retry);
      await setOutcome({
        pool, row, status, now: new Date(),
        nextAttempt: status === 'FAILED_RETRYABLE' ? new Date(Date.now() + delay) : undefined,
        // Never persist arbitrary errors: they may contain secrets or endpoint URLs.
        error: error instanceof EstateDeliveryError ? error.reason : 'DESTINATION_DELIVERY_UNAVAILABLE',
      });
      if (status === 'FAILED_TERMINAL') result.deadLettered += 1;
      else result.retried += 1;
    }
  }
  return result;
}

export async function readIndependentDeliveryStates(pool: DeliveryPool, eventId: string) {
  const r = await pool.query(
    `SELECT o.event_id, o.tenant, o.status AS broker_status, o.published_at AS broker_confirmed_at,
         r.destination_key, r.status AS estate_status,
         r.acknowledged_at, r.acknowledgment_kind, r.acknowledgment_code,
         r.acknowledgment_reference, r.attempt_count
       FROM payload.outbox o
       LEFT JOIN cms_delivery.receipts r ON r.event_id = o.event_id
      WHERE o.event_id = $1 ORDER BY r.destination_key`,
    [eventId],
  );
  return r.rows;
}

/**
 * Explicit, auditable one-event backfill for a destination that was bound
 * after the original event. Never sweep all tenants or inherit another
 * estate's content. A previously DELIVERED row is never reset.
 */
export async function backfillEstateReceipt(params: {
  pool: DeliveryPool;
  eventId: string;
  destinationKey: string;
  tenantId: string;
  digitalEstateId: string;
}): Promise<boolean> {
  const { pool, eventId, destinationKey, tenantId, digitalEstateId } = params;
  if (![eventId, destinationKey, tenantId, digitalEstateId].every(Boolean)) {
    throw new Error('Explicit event and destination context is required for backfill');
  }
  const result = await pool.query(
    `INSERT INTO cms_delivery.receipts (event_id, destination_key, tenant_id, digital_estate_id, status)
     SELECT o.event_id, b.destination_key, b.tenant_id, b.digital_estate_id, 'PENDING'
       FROM payload.outbox o
       JOIN cms_delivery.bindings b ON b.destination_key = $2
      WHERE o.event_id = $1
        AND o.tenant = $3 AND b.tenant_id = $3
        AND b.digital_estate_id = $4 AND b.enabled = true
        AND b.adapter = 'SIGNED_WEBHOOK'
        AND o.envelope->>'eventId' = o.event_id
        AND o.envelope->>'tenantId' = o.tenant
        AND o.envelope->>'digitalEstateId' = b.digital_estate_id
        AND o.event_type LIKE 'content.%'
     ON CONFLICT (event_id, destination_key) DO NOTHING
     RETURNING id`,
    [eventId, destinationKey, tenantId, digitalEstateId],
  );
  return result.rowCount === 1;
}

/**
 * Dead-letter replay is an explicit administrative recovery action. It does
 * not resurrect delivered receipts or alter the canonical broker outcome.
 */
export async function requeueEstateDeadLetter(params: {
  pool: DeliveryPool;
  eventId: string;
  destinationKey: string;
  tenantId: string;
  digitalEstateId: string;
}): Promise<boolean> {
  const { pool, eventId, destinationKey, tenantId, digitalEstateId } = params;
  if (![eventId, destinationKey, tenantId, digitalEstateId].every(Boolean)) {
    throw new Error('Explicit event and destination context is required for requeue');
  }
  const result = await pool.query(
    `UPDATE cms_delivery.receipts r
       SET status = 'PENDING', attempt_count = 0, next_attempt_at = NULL,
           last_error = NULL, acknowledged_at = NULL,
           acknowledgment_kind = NULL, acknowledgment_code = NULL,
           acknowledgment_reference = NULL, updated_at = now()
      FROM cms_delivery.bindings b
     WHERE r.event_id = $1 AND r.destination_key = $2
       AND r.tenant_id = $3 AND r.digital_estate_id = $4
       AND b.destination_key = r.destination_key
       AND b.tenant_id = $3 AND b.digital_estate_id = $4
       AND b.enabled = true AND r.status = 'FAILED_TERMINAL'
     RETURNING r.id`,
    [eventId, destinationKey, tenantId, digitalEstateId],
  );
  return result.rowCount === 1;
}
