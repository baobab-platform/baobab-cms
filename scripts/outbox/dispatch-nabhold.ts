#!/usr/bin/env tsx
/**
 * The legacy Nabhold publisher consumed the canonical outbox status and
 * could mark a broker event as PUBLISHED without publishing to RabbitMQ.
 * This entrypoint is retired: ADR-0018 requires independent destination
 * receipts and signed, bound estate delivery.
 *
 * Use scripts/outbox/dispatch-estate.ts with an explicitly provisioned
 * cms_delivery.bindings row and estate-scoped secret in development.
 */
import process from 'node:process';

console.error('Legacy Nabhold shared-outbox dispatch is retired. Use outbox:dispatch-estate with an authorised binding.');
process.exitCode = 2;
