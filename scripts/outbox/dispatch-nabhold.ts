#!/usr/bin/env tsx
/**
 * Drains the transactional outbox and tells the Nabhold estate to refresh its cache.
 *
 *   tsx scripts/outbox/dispatch-nabhold.ts                  # one cycle, then exit (default)
 *   tsx scripts/outbox/dispatch-nabhold.ts --loop 30        # a cycle every 30 seconds
 *   tsx scripts/outbox/dispatch-nabhold.ts --status         # counts by state, changes nothing
 *   tsx scripts/outbox/dispatch-nabhold.ts --requeue-terminal   # return dead-lettered entries to PENDING once the cause is fixed
 *
 * Environment (all required except the tenant code; the secret is never printed):
 *   NABHOLD_REVALIDATE_URL      https URL of the estate's /api/revalidate (http only for localhost)
 *   NABHOLD_REVALIDATE_SECRET   the estate's revalidation bearer secret
 *   NABHOLD_TENANT_CODE         CMS tenant code, default "nabhold"
 */
import { getPayload } from 'payload';
import config from '../../payload.config.js';
import { NabholdRevalidationPublisher } from '../../src/baobab/events/revalidation-publisher.js';
import { runOutboxDispatchCycle } from '../../src/baobab/outbox/dispatcher.js';

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const loopIndex = args.indexOf('--loop');
const loopSeconds = loopIndex >= 0 ? Number(args[loopIndex + 1]) : 0;
if (loopIndex >= 0 && !(loopSeconds >= 5 && loopSeconds <= 3600)) {
  console.error('--loop needs a number of seconds between 5 and 3600');
  process.exit(2);
}

async function main(): Promise<number> {
  const payload = await getPayload({ config });

  const counts = async () => {
    const out: Record<string, number> = {};
    for (const status of ['PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL']) {
      out[status] = (await payload.count({ collection: 'outbox', where: { status: { equals: status } }, overrideAccess: true })).totalDocs;
    }
    return out;
  };

  if (flag('--status')) {
    console.log(JSON.stringify(await counts(), null, 2));
    return 0;
  }

  if (flag('--requeue-terminal')) {
    const dead = await payload.find({ collection: 'outbox', where: { status: { equals: 'FAILED_TERMINAL' } }, limit: 200, depth: 0, overrideAccess: true });
    for (const doc of dead.docs) {
      await payload.update({ collection: 'outbox', id: doc.id, data: { status: 'PENDING', attemptCount: 0, nextAttemptAt: null, lastError: null } as never, overrideAccess: true });
    }
    console.log(JSON.stringify({ requeued: dead.docs.length }));
    return 0;
  }

  const url = process.env.NABHOLD_REVALIDATE_URL;
  const secret = process.env.NABHOLD_REVALIDATE_SECRET;
  if (!url || !secret) {
    console.error('NABHOLD_REVALIDATE_URL and NABHOLD_REVALIDATE_SECRET are required.');
    return 2;
  }
  const code = process.env.NABHOLD_TENANT_CODE || 'nabhold';
  const tenants = await payload.find({ collection: 'tenants', where: { code: { equals: code } }, limit: 2, depth: 0, overrideAccess: true });
  if (tenants.docs.length !== 1) {
    console.error(`Expected exactly one tenant with code "${code}", found ${tenants.docs.length}.`);
    return 2;
  }
  const publisher = new NabholdRevalidationPublisher({ url, secret, tenantId: String(tenants.docs[0].id) });

  const cycle = async () => {
    const result = await runOutboxDispatchCycle({ payload, publisher });
    console.log(JSON.stringify({ at: new Date().toISOString(), ...result }));
    return result;
  };

  if (!loopSeconds) {
    const result = await cycle();
    return result.deadLettered > 0 ? 1 : 0;
  }
  for (;;) {
    await cycle();
    await new Promise((resolve) => setTimeout(resolve, loopSeconds * 1000));
  }
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('Outbox dispatch failed:', error instanceof Error ? error.message : 'unknown error');
    process.exit(2);
  },
);
