# ADR-0018 — Independent broker and estate delivery receipts

**Implementation level:** connected disposable development component; external estate/CP/IAM provider qualification **not yet accepted**. Baseline: ADR-0018 (canonical event + transactional outbox) and accepted ADR-0021 provider-neutral estate bindings. Depends on PR #70's RabbitMQ publisher confirms.

## Delivery state ownership

| Concern | Durable owner | Success condition |
| --- | --- | --- |
| Canonical event intent | `payload.outbox` event_id and immutable envelope | Same database transaction as editorial mutation |
| RabbitMQ transport | `payload.outbox.status` / `published_at` | RabbitMQ confirm-channel acknowledgment; independent queue readback in CI |
| Each estate destination | `cms_delivery.receipts(event_id,destination_key)` | Signed HTTP returns 2xx **and echoes the exact event ID**, then fenced receipt commit |
| Cache actually fresh | Estate-specific readback/contract | **Not proved** by 2xx or receipt; requires consumer tests |

The canonical RabbitMQ worker **never** marks estate delivery receipts. An estate worker **never** updates `payload.outbox.status`. A failure or retry at either destination must not change any other destination's success state.

## Schema and concurrency guarantees

Migration `20261109_213400_independent_deliveries` adds an independently SQL-managed `cms_delivery` schema alongside Payload's own schema. The two tables are intentionally **not** Payload editorial collections:

- `bindings`: `destination_key` (unique), approved tenant, digital estate, endpoint URL, adapter, enabled flag. No credentials or canonical CP issuance. Default disabled; a governed local administrator must explicitly enable a binding.
- `receipts`: `event_id`, `destination_key` with PostgreSQL UNIQUE, independently owned tenant and estate, status, attempt count, next attempt, UUID claim token, lease expiration, acknowledgment metadata and safe failure category.

An `AFTER INSERT` trigger on `payload.outbox` creates PENDING receipts for *enabled* bindings whose tenant and estate IDs exactly match the canonical envelope. The outbox insert and these receipts are in the **same PostgreSQL transaction**: rollback reverts both. Unbound events do not receive invented subscriptions. Only `content.*` changes are selected for estate revalidation; generic broker events still use RabbitMQ.

Workers claim rows using a single `FOR UPDATE SKIP LOCKED` + `UPDATE ... RETURNING` statement. Claims change status to PUBLISHING and mint a UUID token with a lease. Acknowledgment/retry requires the **same token** and PUBLISHING status; a crashed or delayed worker cannot overwrite a newer claim. Expired leases may be adopted and redelivered, so receivers must deduplicate by event ID. Missing or mismatched binding, tenant, estate, endpoint and unbound identity all **fail closed**.

Statuses: `PENDING → PUBLISHING → DELIVERED`, or `FAILED_RETRYABLE → PUBLISHING`, `FAILED_TERMINAL`; expired PUBLISHING claims become available again. Bounded exponential backoff follows the existing ADR-0018 retry policy. `DELIVERED` means signed **transport acceptance**, not proven cache freshness.

### Explicit post-issuance backfill and replay

A binding registered **after** an event cannot retroactively claim that event was delivered. `backfillEstateReceipt` requires explicit event ID, destination, tenant and estate and checks the event/active binding before inserting a missing PENDING receipt. It never resets a DELIVERED row.

`requeueEstateDeadLetter` similarly requires explicit context and changes only a FAILED_TERMINAL receipt back to PENDING after an operator corrects the underlying problem. Neither operation mutates canonical broker state. Both need governed administration; no general user-facing endpoint or automatic unbounded historical replay is approved.

## Signed adapter and independent acknowledgment

The initial provider-neutral `EstateDeliveryPublisher` interface is exercised by a signed HTTP adapter. The adapter sends a minimal identity envelope (event ID/type, tenant, digital estate, canonical entity, correlation and content key/slug) but no content body, price, private asset or credential. HMAC-SHA256 signs `<epoch-milliseconds>.<JSON-body>`. Receivers must reject stale timestamps, invalid signatures and duplicate event IDs. Delivery refuses redirects and untrusted host/credential forms. Local HTTP loopback is permitted **only** with explicit development opt-in, never production.

The receiver must respond with 2xx and `x-baobab-ack-event-id` matching the original event. A plain 200 is insufficient. Unknown/failed outcomes remain replayable. Secrets are supplied through worker environment, not stored in CMS content or the binding table. The binding URL must exactly match the worker destination URL; no fallback to a Nabhold default.

The retired `scripts/outbox/dispatch-nabhold.ts` returns nonzero rather than reusing the broker ledger. The estate worker is `npm run outbox:dispatch-estate`; it refuses staging/production activation until independently authorised.

## Disposable local development

On a local PostgreSQL 17 / RabbitMQ instance:

1. Apply the committed migrations. Create a development binding with an **already-known local** tenant/estate ID and approved test endpoint; set enabled true only for this disposable scenario.
2. Supply `CMS_REVALIDATION_DESTINATION_KEY`, `CMS_REVALIDATION_TENANT_ID`, `CMS_REVALIDATION_ESTATE_ID`, `CMS_REVALIDATION_URL` and `CMS_REVALIDATION_SECRET` in the development worker environment. `BAOBAB_ENVIRONMENT=development` permits explicit loopback testing.
3. Run `npm run outbox:dispatch` for canonical RabbitMQ publication and `npm run outbox:dispatch-estate` separately for revalidation. **They can now coexist without stealing each other's acknowledgments.**
4. Independently read `payload.outbox` and `cms_delivery.receipts` by event ID to verify both outcomes. Investigate undelivered/terminal records per destination; never infer estate success from a broker confirm.

Example **disposable-only** binding (not CP authorisation or production provisioning):

```sql
INSERT INTO cms_delivery.bindings
  (destination_key, tenant_id, digital_estate_id, endpoint_url, adapter, enabled)
VALUES
  ('demo-estate-webhook', '<local-tenant-id>', '<local-estate-id>',
   'http://127.0.0.1:4000/revalidate', 'SIGNED_WEBHOOK', true);
```

## Actual CI evidence

The `migration-check` job launches PostgreSQL 17 and RabbitMQ and runs `scripts/qualification/pg17-independent-delivery.ts` after real migrations/content fixtures. It asserts:

- one immutable content event produces two distinct PENDING destination receipts in PostgreSQL while the broker stays PENDING;
- canonical event is broker-confirmed and independently read back from an AMQP queue;
- signed estate A acknowledges, while estate B initially returns 503 and retains FAILED_RETRYABLE independently of broker and A;
- estate B retries, echoes the exact event ID, and reaches DELIVERED without resetting A or broker;
- foreign-tenant events cannot inherit estate receipts or be backfilled; unapproved destination/tenant switches are rejected;
- dead-letter is per destination; explicit context-checked requeue is separately verified;
- an expired PUBLISHING lease is adopted, with event-ID idempotency and immutable original event ID.

The evidence class is `LOCAL_PG17_RABBITMQ_SIGNED_HTTP_COMPONENT`. These local receivers are synthetic; they **do not** establish production readiness, an external provider receipt, real CP/IAM approval or browser-visible cache freshness.

## Known remaining obligations

Canonical broker claiming still uses the older Payload query/update path, not a PostgreSQL token-fenced broker worker; it is proven with a single broker worker only. CP/IAM-approved binding issuance, secret lifecycle/rotation, real estate endpoint signature verification and downstream cache readback, multi-region routing, independent operational alerting and protected-environment deployment are out of scope. PostgreSQL schema snapshots currently track Payload-managed tables; `cms_delivery` has an explicit SQL migration and its own schema, which must be preserved by future migration generators.
