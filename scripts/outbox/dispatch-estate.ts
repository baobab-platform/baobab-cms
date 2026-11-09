#!/usr/bin/env tsx
/** ADR-0018: independently acknowledged signed estate revalidation.
 * Environment selects an already-governed DB binding; the worker NEVER
 * provisions tenant, digital estate or recipient. No secret is stored in DB.
 * This entrypoint is disabled for protected staging/production activation.
 */
import process from 'node:process';
import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { getPayload } from 'payload';
import config from '../../payload.config.js';
import { runEstateDeliveryCycle } from '../../src/baobab/outbox/estate-delivery.js';
import { SignedEstateRevalidationPublisher } from '../../src/baobab/events/signed-estate-publisher.js';

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production' || ['staging', 'production'].includes(process.env.BAOBAB_ENVIRONMENT ?? '')) {
    throw new Error('Estate delivery is not yet approved for protected environments');
  }
  const destinationKey = process.env.CMS_REVALIDATION_DESTINATION_KEY ?? '';
  const tenantId = process.env.CMS_REVALIDATION_TENANT_ID ?? '';
  const digitalEstateId = process.env.CMS_REVALIDATION_ESTATE_ID ?? '';
  const url = process.env.CMS_REVALIDATION_URL ?? '';
  const secret = process.env.CMS_REVALIDATION_SECRET ?? '';
  if (![destinationKey, tenantId, digitalEstateId, url, secret].every(Boolean)) {
    throw new Error('Destination key, tenant, estate, URL and private secret must all be explicitly configured');
  }
  const payload = await getPayload({ config });
  try {
    const pool = (payload.db as unknown as PostgresAdapter).pool;
    const publisher = new SignedEstateRevalidationPublisher({
      tenantId, digitalEstateId, url, secret,
      allowLoopbackInDevelopment: process.env.BAOBAB_ENVIRONMENT === 'ci' ||
        process.env.BAOBAB_ENVIRONMENT === 'development',
    });
    const result = await runEstateDeliveryCycle({
      pool, publisher, destinationKey, tenantId, digitalEstateId, endpointUrl: url,
    });
    payload.logger.info(result, 'Independent estate delivery cycle complete');
    if (result.deadLettered) process.exitCode = 1;
  } finally {
    await payload.destroy();
  }
}

main().catch(() => {
  console.error('Estate delivery failed (inspect approved binding, destination and worker evidence)');
  process.exitCode = 2;
});
