# Corporate singleton content: where it lives

Decision for gate CMS-NAB-03. Status: implemented in code; not production-activated.

| Content | Home | `contentKey` | Why |
|---|---|---|---|
| Home page | `pages` (existing) | `home` | It is a routable page and already scope-resolved. |
| Navigation, footer, site settings, group profile | `site-configurations` (new), one record per (tenant, estate, locale, kind) | `navigation`, `footer`, `site-settings`, `group-profile` | Not routes; need tenant isolation, scope resolution and canonical events. |
| Portfolio, sectors, insights | dedicated collections (existing, CMS-NAB-03 part 1) | per record | Many records each, own lifecycle. |

## Field shapes follow the estate's contract

The Nabhold estate reads these keys with flat field names (`navigationItems`, `statement`, `tagline`, `footerLinks`, `siteName`,
`title` and `body` blocks, plus `eyebrow`, `headline`, `introduction`, `primaryCta`, `secondaryCta`, `institutionalStatement` on the
home page). Fields here use those names, and `content.entry.resolve` returns them unchanged, with null values removed so the
estate's schema accepts the object. `pages` gained the optional home fields. The estate's revalidate endpoint currently names these
five keys under collection `pages`; the outbox hand-off (CMS-NAB-07) must send that form or the estate must be extended.

## Rejected alternatives

- **Payload Globals.** One document per installation: no tenant isolation, no per-estate or per-locale instance, no scope
  resolution (ADR-0014), no canonical identity or outbox events (ADR-0013, ADR-0018).
- **Extending `pages`.** Mixes structured configuration into page bodies and invents routes for non-routes.

## Rules enforced

- `kind` is the resolution key; `contentKey` and `slug` are derived from it, never typed.
- Uniqueness per (tenant, estate, locale, kind) is validated on write.
- Links must be site paths or http(s) URLs (no `javascript:`, `data:` or protocol-relative).
- New records are DRAFT. Publication goes through the normal state change and raises the canonical event.
- No registration, tax, VAT or address field exists in this collection.

## Verified

Unit tests (`src/collections/site-configurations.test.ts`) and a real PostgreSQL 16 run: migration up/down/up; create gives
DRAFT with a canonical id; a duplicate kind and a `javascript:` link are rejected; data round-trips through the Payload API;
canonical events reach the outbox.

## Not yet done

`home` content for Nabhold, the `content.entry.resolve` loader over these records, and DRAFT seeds are later gates.
