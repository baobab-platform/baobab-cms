# Nabhold cache revalidation (outbox to the estate)

Gate CMS-NAB-07. Status: implemented in code and exercised against the real Nabhold `/api/revalidate` route and PostgreSQL 16.
Not production-activated: no production URL, secret or schedule exists yet.

## Flow

1. A content change writes an outbox row in the same transaction (ADR-0018). Event payloads now carry `collection`, `slug`, `contentKey`.
2. `scripts/outbox/dispatch-nabhold.ts` drains due rows through `NabholdRevalidationPublisher`
   (`src/baobab/events/revalidation-publisher.ts`).
3. For events of this tenant on the five singleton keys, or portfolio, sector and insight slugs, it sends
   `POST {NABHOLD_REVALIDATE_URL}` with `Authorization: Bearer <secret>` and the estate's narrow body
   (`{collection:"pages",contentKey}` or `{collection,slug}`). Singletons stored in `site-configurations` are sent as `pages`, the
   form the estate accepts. No content is sent.
4. Everything else (other tenants, media, product content, tenant and market projections) is acknowledged as a no-op.

## Reliability

| Case | Result |
|---|---|
| network error, timeout, redirect, 429, 5xx | retry with bounded exponential backoff and jitter (8 attempts) |
| 400, 401, 403, 404 | permanent: straight to `FAILED_TERMINAL` (dead letter) |
| worker crashed mid-delivery | entries stuck in `PUBLISHING` longer than 5 minutes become due again |
| duplicate delivery | harmless; revalidation is idempotent; the event id is sent as `Idempotency-Key` |
| secret, URL | never in an error, log or `lastError`; the URL must be https (http only for localhost) with no embedded credentials |

Reconciliation: `--status` shows counts by state; `--requeue-terminal` returns dead-lettered rows to `PENDING` once the cause (for
example a wrong secret) is fixed. Delivery is at-least-once. Two dispatchers running at once may deliver an event twice, which is
safe here.

## Configuration

`NABHOLD_REVALIDATE_URL`, `NABHOLD_REVALIDATE_SECRET` (matches the estate's `PAYLOAD_REVALIDATE_SECRET`), optional
`NABHOLD_TENANT_CODE` (default `nabhold`). Run `--loop 30` under a supervisor, or `--once` from a scheduler.

## Verified

With the real estate running: publishing a navigation record produced a `content.published` row; a wrong secret dead-lettered the
6 relevant rows at once and 3 irrelevant rows were acknowledged; after `--requeue-terminal` with the right secret all 6 were
delivered. Unit tests cover mapping, scoping, failure classes, secret hygiene, unsafe configuration, permanent failure and stale
`PUBLISHING` recovery.

## Not done

The estate authenticates with a static bearer secret. Signed requests with a timestamp would resist replay but need an estate change.
There is no deployment of the dispatcher, no alert on dead letters (CMS-NAB-08 can report them), and no coalescing of bursts into
one call.
