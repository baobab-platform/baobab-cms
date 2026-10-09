# Collection Classification

Per ADR-0012 §67 and ADR-0019 §10, every collection declares its
ownership, scope, identity and lifecycle model. This table is that
declaration, kept next to (not duplicating) the field-level documentation
already in each `src/collections/*.ts` file's comments and
`admin.description` strings.

| Collection | Authority | Canonical identity | Tenant-owned | Estate/market/locale aware | Publication lifecycle | Inheritance mode | External mappings | Event-producing |
|---|---|---|---|---|---|---|---|---|
| `users` | This engine (local actor projection — ADR-0017 §6) | `canonicalActorId` | Yes (`tenantId`, optional) | Yes (`digitalEstateIds`/`marketIds`/`locales` bindings) | n/a (auth record) | n/a | Actor maps to a canonical actor externally (not yet integrated) | No |
| `tenants` | Control Plane (projected locally — ADR-0012 §5-6) | is the tenant itself | n/a | n/a | n/a | n/a | n/a | Yes (`content.*`, treated as generic content lifecycle for now) |
| `organisations` (legal entity) | This engine (local projection) | `canonicalLegalEntityId` | Yes | n/a | Active/Inactive | n/a | n/a | Yes |
| `regions` | This engine (deprecated legacy) | none | No (platform-global reference list) | n/a | n/a | n/a | n/a | No |
| `digital-estates` | This engine | `canonicalDigitalEstateId` | Yes | Is itself the estate dimension | Active/Inactive | n/a | n/a | Yes |
| `markets` | This engine | `canonicalMarketId` | Yes | Is itself the market dimension; optional `legalEntity` | Enabled/disabled | n/a | n/a | Yes |
| `pages` | This engine (editorial content) | `canonicalEntityId` | Yes | Yes — `digitalEstate`, `market`, `locale` all optional | Draft/Published/Archived | `INHERIT` (see `docs/content-resolution/README.md`) | n/a today | Yes (`content.*`) |
| `portfolio-companies` | This engine (editorial profile only; ownership and legal facts stay with the Control Plane) | `canonicalEntityId` (`PORTFOLIO_PROFILE`) | Yes | Yes: `digitalEstate`, `market`, `locale` optional; `organisation` is the publishing legal entity (required) | Draft/Published/Unpublished/Archived | `INHERIT` | `subjectOrganisationId` is a display reference only | Yes (`content.*`) |
| `sectors` | This engine (editorial) | `canonicalEntityId` (`PAGE`) | Yes | Yes, as above | Draft/Published/Unpublished/Archived | `INHERIT` | n/a | Yes (`content.*`) |
| `insights` | This engine (editorial) | `canonicalEntityId` (`ARTICLE`) | Yes | Yes, as above | Draft/Published/Unpublished/Archived | `INHERIT` | n/a | Yes (`content.*`) |
| `site-configurations` | This engine (editorial) | `canonicalEntityId` (`SITE_CONFIGURATION`) | Yes | Yes, as above | Draft/Published/Unpublished/Archived | `OVERRIDE` (one record per estate and locale; `contentKey` = kind) | n/a | Yes (`content.*`) |
| `product-content` | This engine (editorial only — Medusa owns commerce truth) | `canonicalEntityId` | Yes | Yes — `digitalEstate`, `market`, `locale` all optional | Draft/Review/Published/Unpublished/Archived | `INHERIT` (recommended) | `canonicalProductId` (via `src/baobab/mappings`) | Yes (`content.product.*`) |
| `media` | This engine (editorial metadata); object storage owns the binary | `canonicalMediaId` | Yes | Optional `digitalEstate` | Uploading/Scanning/Ready/Quarantined/Published | n/a | Not yet (media canonicalisation is per-asset, opt-in) | Yes (`media.*`) |
| `outbox` | This engine (internal system state) | n/a (not a canonicalisable business entity — ADR-0013 §9) | Loosely (`tenant` text field, informational) | n/a | n/a | n/a | n/a | No (it *is* the event mechanism) |
| `audit-logs` | This engine (internal system state, immutable) | n/a | Loosely (`tenant` text field, informational) | n/a | n/a | n/a | n/a | No |
| `mapping-projections` | Control Plane (projected locally, explicitly non-authoritative — ADR-0013 §44-46) | n/a (it *records* canonical identity) | Loosely (`tenant` text field) | n/a | Proposed/Active/Superseded/Retired/Invalid/Ambiguous | n/a | Is itself the mapping cache | No |

## Retention

No collection in this repository implements automated retention/purge —
ADR-0012 §54-55 and ADR-0020 §148-149 require tenant offboarding/deletion
to be deliberate and governed, not automatic. `audit-logs` in particular
must not be silently pruned without an explicit retention policy decision
(ADR-0017 §81-82).

## Adding a new collection

1. Fill in a new row of the table above *before* writing code — if you
   can't answer "tenant-owned?", "canonical identity required?" and
   "publication lifecycle?", you're not ready to declare the collection
   (ADR-0012 §67, ADR-0019 §10).
2. Compose it from `src/baobab/tenancy`, `src/baobab/identity`, and
   `src/baobab/events` per `docs/tenancy/README.md` and
   `docs/events/README.md` rather than writing bespoke access/hook logic.
3. Register it in `payload.config.ts`'s `collections` array.
4. `npm run db:generate -- <name>` and apply the fix documented in
   `docs/migrations/README.md`.
