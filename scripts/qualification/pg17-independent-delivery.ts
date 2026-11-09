/**
 * ADR-0018 connected, disposable component witness. Uses actual PostgreSQL 17
 * persistence, RabbitMQ publisher confirms + independent broker readback, and
 * two signed local HTTP receivers. It is NOT a real external estate/CDN or
 * IAM/Control Plane integration proof.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import amqp from 'amqplib';
import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { getPayload } from 'payload';
import { RabbitMqEventPublisher } from '../../src/baobab/events/rabbitmq-publisher.js';
import { SignedEstateRevalidationPublisher } from '../../src/baobab/events/signed-estate-publisher.js';
import { runOutboxDispatchCycle } from '../../src/baobab/outbox/dispatcher.js';
import { backfillEstateReceipt, readIndependentDeliveryStates, requeueEstateDeadLetter, runEstateDeliveryCycle } from '../../src/baobab/outbox/estate-delivery.js';
import type { CanonicalEventEnvelope } from '../../src/baobab/events/types.js';

const secret = randomBytes(32).toString('hex'); // ephemeral per CI process, never committed or logged
let checkpoint = 'start';
const reached = (name: string): void => { checkpoint = name; console.log(`ADR-0018 qualification checkpoint: ${name}`); };

function requireDisposableEnvironment(): string {
  const database = new URL(process.env.DATABASE_URL ?? '');
  const broker = new URL(process.env.RABBITMQ_URL ?? '');
  assert.equal(process.env.BAOBAB_ENVIRONMENT, 'ci');
  assert.equal(process.env.CMS_PG17_COMPONENT_QUALIFICATION, 'synthetic-disposable');
  assert.equal(database.protocol, 'postgresql:');
  assert(['localhost', '127.0.0.1'].includes(database.hostname));
  assert.equal(database.pathname, '/cms_pg17_qualification');
  assert.equal(database.search, '');
  assert.equal(broker.protocol, 'amqp:');
  assert(['localhost', '127.0.0.1'].includes(broker.hostname));
  assert(['', '5672'].includes(broker.port));
  assert(['', '/'].includes(broker.pathname));
  assert.equal(broker.search, '');
  assert.equal(broker.hash, '');
  return broker.href;
}

function launchReceiver(failFirst: boolean): Promise<{
  server: Server;
  url: string;
  accepted: Set<string>;
  attempts: Map<string, number>;
}> {
  const accepted = new Set<string>();
  const attempts = new Map<string, number>();
  const server = createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const body = Buffer.concat(chunks).toString('utf8');
    let parsed: { eventId: string; tenantId: string; digitalEstateId: string };
    try { parsed = JSON.parse(body) as typeof parsed; }
    catch { res.writeHead(400).end(); return; }

    const timestamp = String(req.headers['x-baobab-timestamp'] ?? '');
    const supplied = String(req.headers['x-baobab-signature'] ?? '');
    const expected = createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex');
    const validSignature = supplied.length === expected.length &&
      timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    if (!validSignature || !timestamp || Math.abs(Date.now() - Number(timestamp)) > 60_000 ||
        req.headers['idempotency-key'] !== parsed.eventId) {
      res.writeHead(401).end(); return;
    }

    attempts.set(parsed.eventId, (attempts.get(parsed.eventId) ?? 0) + 1);
    if (failFirst && attempts.get(parsed.eventId) === 1) {
      res.writeHead(503).end(); return;
    }
    // Receiver-side event-ID deduplication makes committed-result replay safe.
    accepted.add(parsed.eventId);
    res.writeHead(204, { 'x-baobab-ack-event-id': parsed.eventId }).end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({ server, url: `http://127.0.0.1:${address.port}/revalidate`, accepted, attempts });
    });
  });
}

function event(id: string, tenant: string, estate: string): CanonicalEventEnvelope {
  return {
    eventId: id,
    eventType: 'content.published',
    eventVersion: 1,
    occurredAt: new Date().toISOString(),
    sourceEngine: 'CONTENT',
    sourceEngineInstance: 'cms-ci-disposable',
    canonicalEntityId: randomUUID(),
    canonicalEntityType: 'PAGE',
    tenantId: tenant,
    digitalEstateId: estate,
    correlationId: randomUUID(),
    payload: { collection: 'pages', contentKey: 'home', slug: 'home' },
  };
}

async function main(): Promise<void> {
  const brokerUrl = requireDisposableEnvironment();
  reached('environment checked');
  const receiverA = await launchReceiver(false);
  const receiverB = await launchReceiver(true);
  const { default: config } = await import('../../payload.config.js');
  const payload = await getPayload({ config });
  reached('payload connected');
  try {
    const pool = (payload.db as unknown as PostgresAdapter).pool;
    const version = await pool.query('SHOW server_version_num');
    assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 17);

    const tenant = randomUUID(), estate = randomUUID(), otherTenant = randomUUID();
    const destinationA = `estate-a-${randomUUID()}`, destinationB = `estate-b-${randomUUID()}`;
    const eventId = randomUUID(), foreignEventId = randomUUID();
    const queue = `cms.independent-delivery.${eventId}`;

    for (const [destinationKey, url] of [[destinationA, receiverA.url], [destinationB, receiverB.url]]) {
      await pool.query(
        `INSERT INTO cms_delivery.bindings
          (destination_key, tenant_id, digital_estate_id, endpoint_url, adapter, enabled)
          VALUES ($1, $2, $3, $4, 'SIGNED_WEBHOOK', true)`,
        [destinationKey, tenant, estate, url],
      );
    }

    const envelope = event(eventId, tenant, estate);
    const foreign = event(foreignEventId, otherTenant, estate);
    for (const e of [envelope, foreign]) {
      await pool.query(
        `INSERT INTO payload.outbox
          (event_id, event_type, tenant, canonical_entity_id, envelope, status, attempt_count)
          VALUES ($1, $2, $3, $4, $5::jsonb, 'PENDING', 0)`,
        [e.eventId, e.eventType, e.tenantId, e.canonicalEntityId, JSON.stringify(e)],
      );
    }

    // The trigger writes each independent delivery intent in the SAME DB
    // transaction as the canonical event, and excludes the foreign tenant.
    const initial = await readIndependentDeliveryStates(pool, eventId);
    reached('two transaction-created estate receipts read');
    assert.equal(initial.length, 2);
    assert(initial.every((r) => r.broker_status === 'PENDING' && r.estate_status === 'PENDING'));
    const foreignRows = await pool.query(
      'SELECT count(*)::integer AS count FROM cms_delivery.receipts WHERE event_id = $1',
      [foreignEventId],
    );
    assert.equal(foreignRows.rows[0].count, 0);

    // Real RabbitMQ confirm channel and independently read back the immutable
    // canonical event using a separate AMQP connection.
    const brokerResult = await runOutboxDispatchCycle({
      payload, publisher: new RabbitMqEventPublisher(brokerUrl, queue), tenantId: tenant,
    });
    assert.equal(brokerResult.published, 1);
    reached('RabbitMQ broker confirmed');
    const connection = await amqp.connect(brokerUrl);
    try {
      const channel = await connection.createChannel();
      try {
        await channel.assertQueue(queue, { durable: true });
        const message = await channel.get(queue, { noAck: false });
        assert(message, 'Canonical event must be independently readable from RabbitMQ');
        assert.equal(message.properties.messageId, eventId);
        assert.equal(JSON.parse(message.content.toString('utf8')).eventId, eventId);
        channel.ack(message);
      } finally { await channel.close(); }
    } finally { await connection.close(); }

    const args = (destinationKey: string, url: string) => ({
      pool,
      destinationKey, tenantId: tenant, digitalEstateId: estate, endpointUrl: url,
      publisher: new SignedEstateRevalidationPublisher({
        tenantId: tenant, digitalEstateId: estate, url, secret,
        allowLoopbackInDevelopment: true,
      }),
      retryPolicy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 1 },
    });

    const first = await runEstateDeliveryCycle(args(destinationA, receiverA.url));
    reached('estate A delivered');
    assert.equal(first.delivered, 1);
    const afterA = await readIndependentDeliveryStates(pool, eventId);
    assert(afterA.every((r) => r.broker_status === 'PUBLISHED'));
    assert.equal(afterA.find((r) => r.destination_key === destinationA)?.estate_status, 'DELIVERED');
    assert.equal(afterA.find((r) => r.destination_key === destinationB)?.estate_status, 'PENDING');

    const failed = await runEstateDeliveryCycle(args(destinationB, receiverB.url));
    assert.equal(failed.retried, 1);
    const afterFailure = await readIndependentDeliveryStates(pool, eventId);
    assert.equal(afterFailure.find((r) => r.destination_key === destinationB)?.estate_status, 'FAILED_RETRYABLE');
    assert.equal(afterFailure.find((r) => r.destination_key === destinationA)?.estate_status, 'DELIVERED');
    assert(afterFailure.every((r) => r.broker_status === 'PUBLISHED'));

    // Must not reuse A's receipt to treat B as successful; after B's own
    // retry the signed HTTP receiver explicitly echoes this event ID.
    reached('estate B retrying');
    const retry = await runEstateDeliveryCycle({
      ...args(destinationB, receiverB.url), now: new Date(Date.now() + 2_000),
    });
    assert.equal(retry.delivered, 1);
    reached('estate B delivered');
    const complete = await readIndependentDeliveryStates(pool, eventId);
    assert.equal(complete.length, 2);
    assert(complete.every((r) => r.broker_status === 'PUBLISHED' &&
      r.estate_status === 'DELIVERED' && r.acknowledgment_code === 204 &&
      r.acknowledgment_reference === eventId));
    assert(receiverA.accepted.has(eventId) && receiverB.accepted.has(eventId));
    assert.equal(receiverA.attempts.get(eventId), 1);
    assert.equal(receiverB.attempts.get(eventId), 2);


    assert.equal(await backfillEstateReceipt({
      pool, eventId: foreignEventId, destinationKey: destinationA,
      tenantId: otherTenant, digitalEstateId: estate,
    }), false, 'A foreign-tenant outbox event must never be backfilled into this estate');

    const duplicate = await runEstateDeliveryCycle(args(destinationA, receiverA.url));
    assert.equal(duplicate.claimed, 0);
    assert.equal(receiverA.attempts.get(eventId), 1);

    // Dead-letter is strictly per destination. An explicit, context-checked
    // replay can later recover this destination without resetting the broker
    // result or any other destination's receipt.
    const terminalId = randomUUID(), terminal = event(terminalId, tenant, estate);
    await pool.query(
      `INSERT INTO payload.outbox
        (event_id, event_type, tenant, canonical_entity_id, envelope, status, attempt_count)
        VALUES ($1, $2, $3, $4, $5::jsonb, 'PENDING', 0)`,
      [terminalId, terminal.eventType, tenant, terminal.canonicalEntityId, JSON.stringify(terminal)],
    );
    const terminalAttempt = await runEstateDeliveryCycle({
      ...args(destinationB, receiverB.url),
      retryPolicy: { maxAttempts: 1, baseDelayMs: 1, maxDelayMs: 1 },
    });
    assert.equal(terminalAttempt.deadLettered, 1);
    assert.equal((await readIndependentDeliveryStates(pool, terminalId))
      .find((r) => r.destination_key === destinationB)?.estate_status, 'FAILED_TERMINAL');
    assert.equal(await requeueEstateDeadLetter({
      pool, eventId: terminalId, destinationKey: destinationB,
      tenantId: otherTenant, digitalEstateId: estate,
    }), false, 'A foreign actor may not requeue a different tenant');
    assert.equal(await requeueEstateDeadLetter({
      pool, eventId: terminalId, destinationKey: destinationB,
      tenantId: tenant, digitalEstateId: estate,
    }), true);
    const repaired = await runEstateDeliveryCycle(args(destinationB, receiverB.url));
    assert.equal(repaired.delivered, 1);
    reached('dead letter independently requeued');
    assert.equal((await readIndependentDeliveryStates(pool, terminalId))
      .find((r) => r.destination_key === destinationB)?.estate_status, 'DELIVERED');
    // Close A's own pending receipt for the terminal-case event before the
    // separate crash witness (a batch otherwise correctly picks both).
    const terminalA = await runEstateDeliveryCycle(args(destinationA, receiverA.url));
    assert.equal(terminalA.delivered, 1);

    // A disabled/unrecognised destination cannot select an arbitrary
    // existing event or inherit another estate's delivery permissions.
    await assert.rejects(runEstateDeliveryCycle({
      ...args(destinationA, receiverA.url), tenantId: otherTenant,
    }), /binding not authorised/);

    // Crash recovery: insert a fresh canonical event and simulate a worker
    // whose durable claim lease expired before acknowledgment.
    const crashId = randomUUID(), crashed = event(crashId, tenant, estate);
    await pool.query(
      `INSERT INTO payload.outbox
        (event_id, event_type, tenant, canonical_entity_id, envelope, status, attempt_count)
        VALUES ($1, $2, $3, $4, $5::jsonb, 'PENDING', 0)`,
      [crashId, crashed.eventType, tenant, crashed.canonicalEntityId, JSON.stringify(crashed)],
    );
    await pool.query(
      `UPDATE cms_delivery.receipts SET status='PUBLISHING',
        claim_token=gen_random_uuid(), lease_until=now() - interval '60 seconds', attempt_count=1
        WHERE event_id=$1 AND destination_key=$2`,
      [crashId, destinationA],
    );
    const adopted = await runEstateDeliveryCycle(args(destinationA, receiverA.url));
    assert.equal(adopted.delivered, 1);
    reached('expired lease adopted');
    const adoptRows = await readIndependentDeliveryStates(pool, crashId);
    assert.equal(adoptRows.find((r) => r.destination_key === destinationA)?.estate_status, 'DELIVERED');

    console.log(JSON.stringify({
      schema: 'cms.adr0018.independent-delivery.v1',
      evidence_class: 'LOCAL_PG17_RABBITMQ_SIGNED_HTTP_COMPONENT',
      passed: true, original_event_id: eventId,
      canonical_broker: 'CONFIRMED_AND_INDEPENDENTLY_READ_BACK',
      destination_count: 2, separately_delivered: true,
      broker_unchanged_during_destination_retry: true, recovered_stale_lease: true,
      cross_tenant_receipt_count: 0, recovered_dead_letter: true,
      external_estate_qualified: false,
      control_plane_iam_connected: false, staging_production_authorized: false,
    }));
  } finally {
    reached('closing resources');
    await payload.destroy();
    for (const server of [receiverA.server, receiverB.server]) server.closeAllConnections();
    await Promise.all([receiverA.server, receiverB.server].map((server) =>
      new Promise<void>((resolve) => server.close(() => resolve()))));
  }
}

const watchdog = setTimeout(() => {
  console.error('Independent-delivery component qualification timed out at checkpoint:', checkpoint);
  process.exit(2);
}, 150_000);
watchdog.unref();
main().then(
  () => { clearTimeout(watchdog); process.exit(0); },
  (error) => {
    clearTimeout(watchdog);
    console.error('Independent-delivery component qualification failed at', checkpoint, ':',
      error instanceof Error ? error.message : 'unknown');
    process.exit(1);
  },
);
