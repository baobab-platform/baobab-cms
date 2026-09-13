#!/usr/bin/env tsx
/**
 * =============================================================================
 * Verified end-to-end (see docs/operations/onboard-zuribeans.md's header)
 * against a real PostgreSQL 16 instance: idempotent re-run, reconciliation,
 * and the tenancy isolation suite all confirmed. That was a local sandbox
 * database, not a shared dev/staging environment -- none exists yet for
 * this greenfield project.
 * =============================================================================
 *
 * PURPOSE
 * -------
 * Idempotent Local-API seed for the Zuribeans digital estate while the Baobab
 * Control Plane is not yet ready to issue authoritative tenant / market /
 * digital-estate records.
 *
 * Creates (or reuses) local CMS *projections* only, in dependency order:
 *   1. Tenant            collection: tenants           code = zuribeans
 *   2. Organisation      collection: organisations     code = zuribeans (legal entity)
 *   3. Markets           collection: markets           zuribeans_za (default), zuribeans_ug
 *   4. Digital estate    collection: digital-estates   code = zuribeans
 *   5. Editorial user    collection: users             content-admin@zuribeans.local
 *   6. Service user      collection: users             svc-zuribeans-content@… (API-key machine id)
 *   7. Home page         collection: pages             slug/contentKey = home (published, ZA + en)
 *   8. ProductContent    collection: product-content   three DRAFT stubs (placeholder canonical IDs)
 *
 * RATIONALE (why this design)
 * ---------------------------
 * - Control Plane owns canonical tenant/estate/market identity (ADR-0012).
 *   Until CP can register Zuribeans, the CMS holds non-authoritative
 *   projections (`isProjection: true` on tenants) so editorial work can
 *   proceed without inventing a parallel authority.
 * - SYSTEM_ACTOR + overrideAccess is the supported way for seed/migration
 *   scripts to call the Local API without a real authenticated session
 *   (see src/baobab/context/system-actor.ts). Platform context still requires
 *   an *explicit* tenant id on tenant-owned creates (tenantOwnedField).
 * - ProductContent stubs use placeholder canonicalProductIds of the form
 *   `zuribeans.product.*`. These are NOT Medusa IDs and must later be mapped
 *   via Control Plane / MappingProjections — never by SKU or slug (ADR-0015).
 * - Domains on the digital estate are routing configuration only, never
 *   identity (ADR-0012 §25). Placeholders: zuribeans.co.za / zuribeans.co.ug.
 * - Service identity is interim: Payload API key + serviceIdentity flag.
 *   Long-term replace with Keycloak workload client (baobab-iam Gate IAM-4 /
 *   ADR-0007) once baobab-cms OIDC (Gate IAM-5 phase 2b) lands.
 * - No hard-coded `if (tenant === 'zuribeans')` anywhere in app code —
 *   behaviour is data-driven by these projection records (ADR-0011).
 *
 * USAGE
 * -----
 *   # From nabhold/baobab-cms repo root, with DATABASE_URL / PAYLOAD_SECRET set:
 *   npx tsx scripts/onboarding/zuribeans.ts
 *
 *   Optional env:
 *     ZURIBEANS_ADMIN_PASSWORD   password for content-admin (default: change-me)
 *     ZURIBEANS_SVC_PASSWORD     password for service user  (default: change-me)
 *
 * IDEMPOTENCY
 * -----------
 * Looks up existing records by stable `code` / `email` / scoped `slug` before
 * create. Safe to re-run; does not delete or overwrite published editorial
 * body text if the home page already exists.
 *
 * RELATED DOCS (same repo)
 * ------------------------
 *   docs/operations/onboard-zuribeans.md   — operator runbook for this seed
 *   docs/operations/runbooks.md            — general ops
 *   docs/architecture/gap-analysis.md      — why projections exist
 *   src/collections/*.ts                   — schemas this script writes into
 *
 * =============================================================================
 */

import { getPayload } from 'payload'
import config from '../../payload.config.js'
import { SYSTEM_ACTOR } from '../../src/baobab/context/system-actor.js'
import { EditorialRole, Capability } from '../../src/baobab/authorization/roles.js'
import { ContentScope } from '../../src/baobab/tenancy/scope.js'

// ---------------------------------------------------------------------------
// Stable codes — never change these once data exists in any environment.
// Canonical entity IDs are issued by canonicalIdField / issueCanonicalEntityId
// (src/baobab/identity/) and must remain stable even if Payload local IDs
// change after migration (ADR-0013).
// ---------------------------------------------------------------------------
const TENANT_CODE = 'zuribeans'
const ORG_CODE = 'zuribeans'
const ESTATE_CODE = 'zuribeans'
/** Default market for Zuribeans (product decision: South Africa first). */
const MARKET_ZA_CODE = 'zuribeans_za'
const MARKET_UG_CODE = 'zuribeans_ug'
const DEFAULT_LOCALE = 'en'

const CONTENT_ADMIN_EMAIL = 'content-admin@zuribeans.local'
const SERVICE_USER_EMAIL = 'svc-zuribeans-content@zuribeans.local'

/**
 * Placeholder product keys for editorial stubs.
 * Target collection: product-content (src/collections/ProductContent.ts).
 * These are NOT Medusa/Trade IDs — map to real commerce products later via
 * Control Plane mappings (ADR-0015 §41), never by SKU or slug.
 */
const PRODUCT_STUBS = [
  {
    canonicalProductId: 'zuribeans.product.sample-beans',
    headline: 'Sample Green Beans',
    shortDescription: 'Placeholder editorial stub for green coffee beans.',
  },
  {
    canonicalProductId: 'zuribeans.product.sample-roast',
    headline: 'Sample Roast',
    shortDescription: 'Placeholder editorial stub for roasted coffee.',
  },
  {
    canonicalProductId: 'zuribeans.product.sample-pack',
    headline: 'Sample Pack',
    shortDescription: 'Placeholder editorial stub for a sample pack.',
  },
] as const

// ---------------------------------------------------------------------------
// Helpers — Local API access under SYSTEM_ACTOR
// ---------------------------------------------------------------------------

/**
 * Find a single document by a unique field, or null.
 *
 * Purpose: keep the seed idempotent — re-runs must not create duplicates.
 * Rationale: overrideAccess: true so lookup is not filtered by the empty
 * tenant context of a bootstrap process.
 */
async function findOneByField(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: string,
  field: string,
  value: string,
): Promise<Record<string, unknown> | null> {
  const result = await payload.find({
    collection: collection as 'tenants',
    where: { [field]: { equals: value } },
    limit: 1,
    depth: 0,
    // System context — no tenant filter needed for lookup during seed.
    overrideAccess: true,
  })
  return (result.docs[0] as unknown as Record<string, unknown> | undefined) ?? null
}

/**
 * Local-API create with the synthetic system actor.
 *
 * Target: any collection via Payload Local API (same process as the CMS).
 *
 * Rationale:
 * - overrideAccess: true bypasses collection access functions so platform
 *   bootstrap can create tenant-owned rows before any human editor exists.
 * - user: SYSTEM_ACTOR makes resolveContext see platformAdministrator=true
 *   (kind: 'platform'), required for tenants / users management
 *   (src/baobab/context/system-actor.ts, ADR-0012 §33).
 * - For tenant-owned collections, data.tenant MUST still be supplied
 *   explicitly (tenantOwnedField beforeChange when context.kind === 'platform').
 */
async function systemCreate(
  payload: Awaited<ReturnType<typeof getPayload>>,
  collection: string,
  data: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const doc = await payload.create({
    collection: collection as 'tenants',
    data: data as never,
    user: SYSTEM_ACTOR as never,
    overrideAccess: true,
  })
  return doc as unknown as Record<string, unknown>
}

// ---------------------------------------------------------------------------
// Seed steps — one function per target collection / entity type
// ---------------------------------------------------------------------------

/**
 * Ensure tenant projection exists.
 *
 * Target path: src/collections/Tenants.ts  (slug: tenants)
 * Lookup key:  code === 'zuribeans'
 *
 * Rationale: Tenants is platform-admin only and is NOT tenant-owned.
 * isProjection: true marks this as non-authoritative until Control Plane
 * registers Zuribeans (ADR-0012 §5-6).
 */
async function ensureTenant(
  payload: Awaited<ReturnType<typeof getPayload>>,
): Promise<Record<string, unknown>> {
  const existing = await findOneByField(payload, 'tenants', 'code', TENANT_CODE)
  if (existing) {
    console.log(`[skip] tenant already exists: ${TENANT_CODE} (id=${existing.id})`)
    return existing
  }

  const doc = await systemCreate(payload, 'tenants', {
    name: 'Zuribeans',
    code: TENANT_CODE,
    status: 'active',
    isolationProfile: 'shared-logical',
    defaultLocale: DEFAULT_LOCALE,
    supportedLocales: [DEFAULT_LOCALE],
    isProjection: true, // Control Plane is not authoritative yet
    lastSyncedAt: new Date().toISOString(),
    metadata: {
      note: 'Local projection — replace/sync when Control Plane registers Zuribeans',
      onboardedAt: new Date().toISOString(),
    },
  })
  console.log(`[create] tenant ${TENANT_CODE} (id=${doc.id})`)
  return doc
}

/**
 * Ensure legal-entity (organisation) projection exists.
 *
 * Target path: src/collections/Organisations.ts  (slug: organisations)
 * Lookup key:  code === 'zuribeans'
 *
 * Rationale: Legal entity ≠ tenant (ADR-0012 §23). Collection is tenant-owned,
 * so tenant id must be passed explicitly under platform/SYSTEM_ACTOR context.
 */
async function ensureOrganisation(
  payload: Awaited<ReturnType<typeof getPayload>>,
  tenantId: string,
): Promise<Record<string, unknown>> {
  const existing = await findOneByField(payload, 'organisations', 'code', ORG_CODE)
  if (existing) {
    console.log(`[skip] organisation already exists: ${ORG_CODE} (id=${existing.id})`)
    return existing
  }

  const doc = await systemCreate(payload, 'organisations', {
    name: 'Zuribeans',
    code: ORG_CODE,
    status: 'active',
    tenant: tenantId,
  })
  console.log(`[create] organisation ${ORG_CODE} (id=${doc.id})`)
  return doc
}

/**
 * Ensure one market projection exists.
 *
 * Target path: src/collections/Markets.ts  (slug: markets)
 * Lookup key:  code (e.g. zuribeans_za / zuribeans_ug)
 *
 * Rationale: A market is not merely a country (ADR-0011 §11, ADR-0014 §10).
 * Codes align with nabhold/zuribeans env (NEXT_PUBLIC_ENABLED_MARKETS) and
 * Trade bootstrap keys so composition does not invent parallel identifiers.
 */
async function ensureMarket(
  payload: Awaited<ReturnType<typeof getPayload>>,
  params: {
    tenantId: string
    orgId: string
    code: string
    name: string
    currency: string
    geography: string[]
  },
): Promise<Record<string, unknown>> {
  const existing = await findOneByField(payload, 'markets', 'code', params.code)
  if (existing) {
    console.log(`[skip] market already exists: ${params.code} (id=${existing.id})`)
    return existing
  }

  const doc = await systemCreate(payload, 'markets', {
    name: params.name,
    code: params.code,
    currency: params.currency,
    geography: params.geography,
    channel: 'b2b',
    brand: 'Zuribeans',
    supportedLocales: [DEFAULT_LOCALE],
    enabled: true,
    tenant: params.tenantId,
    legalEntity: params.orgId,
  })
  console.log(`[create] market ${params.code} (id=${doc.id})`)
  return doc
}

/**
 * Ensure digital-estate projection exists.
 *
 * Target path: src/collections/DigitalEstates.ts  (slug: digital-estates)
 * Lookup key:  code === 'zuribeans'
 *
 * Rationale: Estate identity is never inferred from hostname (ADR-0012 §25).
 * domains[] is routing config only; placeholders until product decides final
 * hostnames (zuribeans.co.za / zuribeans.co.ug).
 * defaultMarket points at South Africa (product default).
 */
async function ensureDigitalEstate(
  payload: Awaited<ReturnType<typeof getPayload>>,
  params: { tenantId: string; defaultMarketId: string },
): Promise<Record<string, unknown>> {
  const existing = await findOneByField(payload, 'digital-estates', 'code', ESTATE_CODE)
  if (existing) {
    console.log(`[skip] digital estate already exists: ${ESTATE_CODE} (id=${existing.id})`)
    return existing
  }

  const doc = await systemCreate(payload, 'digital-estates', {
    name: 'Zuribeans',
    code: ESTATE_CODE,
    domains: ['zuribeans.co.za', 'zuribeans.co.ug'],
    defaultLocale: DEFAULT_LOCALE,
    defaultMarket: params.defaultMarketId,
    status: 'active',
    tenant: params.tenantId,
  })
  console.log(`[create] digital estate ${ESTATE_CODE} (id=${doc.id})`)
  return doc
}

/**
 * Ensure a user (human editor or service identity) exists.
 *
 * Target path: src/collections/Users.ts  (slug: users)
 * Lookup key:  email
 *
 * Rationale:
 * - Users are local projections of canonical actors (ADR-0017); canonicalActorId
 *   is assigned by the collection field hook on create.
 * - tenantId / legalEntityId / digitalEstateIds are free-text bindings resolved
 *   by context — Users is not wired through tenantOwnedField.
 * - serviceIdentity: true marks machine accounts; do not reuse human users for
 *   Medusa/CP/outbox integrations (ADR-0017 §50).
 * - Legacy tenantID / organisationID / roles kept for expand-and-contract
 *   compatibility with the original installation (ADR-0019).
 */
async function ensureUser(
  payload: Awaited<ReturnType<typeof getPayload>>,
  params: {
    email: string
    password: string
    tenantId: string
    legalEntityId: string
    digitalEstateId: string
    marketIds: string[]
    editorialRoles: string[]
    capabilities: string[]
    serviceIdentity: boolean
  },
): Promise<Record<string, unknown>> {
  const existing = await findOneByField(payload, 'users', 'email', params.email)
  if (existing) {
    console.log(`[skip] user already exists: ${params.email} (id=${existing.id})`)
    return existing
  }

  const doc = await systemCreate(payload, 'users', {
    email: params.email,
    password: params.password,
    tenantId: params.tenantId,
    legalEntityId: params.legalEntityId,
    digitalEstateIds: [params.digitalEstateId],
    marketIds: params.marketIds,
    locales: [DEFAULT_LOCALE],
    editorialRoles: params.editorialRoles,
    capabilities: params.capabilities,
    platformAdministrator: false,
    serviceIdentity: params.serviceIdentity,
    // Legacy fields kept for expand-and-contract compatibility
    tenantID: params.tenantId,
    organisationID: params.legalEntityId,
    roles: params.serviceIdentity ? ['viewer'] : ['editor'],
  })
  console.log(
    `[create] user ${params.email} (id=${doc.id}, serviceIdentity=${params.serviceIdentity})`,
  )
  return doc
}

/**
 * Ensure the published home page exists for the default market + locale.
 *
 * Target path: src/collections/Pages.ts  (slug: pages)
 * Lookup key:  (tenant, digitalEstate, locale, slug=home) — scoped uniqueness
 *              (ADR-0012 §65-66), not global unique.
 *
 * Rationale: First vertical-slice content the estate can compose against.
 * contentScope DIGITAL_ESTATE ties resolution to the Zuribeans estate without
 * making the page platform-global. status published so delivery APIs can
 * return it immediately after seed.
 */
async function ensureHomePage(
  payload: Awaited<ReturnType<typeof getPayload>>,
  params: {
    tenantId: string
    orgId: string
    estateId: string
    marketZaId: string
  },
): Promise<Record<string, unknown>> {
  // Scoped uniqueness is (tenant, digitalEstate, locale, slug) — not global.
  const result = await payload.find({
    collection: 'pages',
    where: {
      and: [
        { slug: { equals: 'home' } },
        { tenant: { equals: params.tenantId } },
        { digitalEstate: { equals: params.estateId } },
        { locale: { equals: DEFAULT_LOCALE } },
      ],
    },
    limit: 1,
    depth: 0,
    overrideAccess: true,
  })
  if (result.docs[0]) {
    console.log(`[skip] home page already exists (id=${result.docs[0].id})`)
    return result.docs[0] as unknown as Record<string, unknown>
  }

  const doc = await systemCreate(payload, 'pages', {
    title: 'Zuribeans',
    slug: 'home',
    contentKey: 'home',
    status: 'published',
    locale: DEFAULT_LOCALE,
    contentScope: ContentScope.DIGITAL_ESTATE,
    tenant: params.tenantId,
    organisation: params.orgId,
    digitalEstate: params.estateId,
    market: params.marketZaId,
    // Lexical/richText shape is adapter-specific; empty-ish root is valid bootstrap.
    content: {
      root: {
        type: 'root',
        children: [
          {
            type: 'paragraph',
            children: [
              {
                type: 'text',
                text: 'Welcome to Zuribeans — B2B coffee sourcing for South Africa and Uganda.',
              },
            ],
          },
        ],
        direction: null,
        format: '',
        indent: 0,
        version: 1,
      },
    },
  })
  console.log(`[create] home page (id=${doc.id})`)
  return doc
}

/**
 * Ensure DRAFT ProductContent stubs exist for later Medusa composition.
 *
 * Target path: src/collections/ProductContent.ts  (slug: product-content)
 * Lookup key:  (canonicalProductId, tenant, locale)
 *
 * Rationale: Editorial-only records (ADR-0015). commerceProjection is
 * non-authoritative. publicationState DRAFT until real Trade products and
 * Control Plane mappings exist. contentScope MARKET so ZA-specific copy can
 * diverge from UG later without changing the model.
 */
async function ensureProductStubs(
  payload: Awaited<ReturnType<typeof getPayload>>,
  params: {
    tenantId: string
    estateId: string
    marketZaId: string
  },
): Promise<void> {
  for (const stub of PRODUCT_STUBS) {
    const existing = await payload.find({
      collection: 'product-content',
      where: {
        and: [
          { canonicalProductId: { equals: stub.canonicalProductId } },
          { tenant: { equals: params.tenantId } },
          { locale: { equals: DEFAULT_LOCALE } },
        ],
      },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    if (existing.docs[0]) {
      console.log(`[skip] product-content already exists: ${stub.canonicalProductId}`)
      continue
    }

    const doc = await systemCreate(payload, 'product-content', {
      canonicalProductId: stub.canonicalProductId,
      headline: stub.headline,
      shortDescription: stub.shortDescription,
      locale: DEFAULT_LOCALE,
      contentScope: ContentScope.MARKET,
      publicationState: 'DRAFT',
      tenant: params.tenantId,
      digitalEstate: params.estateId,
      market: params.marketZaId,
      commerceProjection: {
        status: 'unknown',
        lastSyncedAt: null,
      },
    })
    console.log(`[create] product-content ${stub.canonicalProductId} (id=${doc.id})`)
  }
}

// ---------------------------------------------------------------------------
// Main — orchestration only; all business rules live in ensure* helpers above
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('=== Zuribeans Content Engine onboarding seed ===')
  console.log('Control Plane offline path — local projections only')
  console.log('Target script path: nabhold/baobab-cms/scripts/onboarding/zuribeans.ts\n')

  const payload = await getPayload({ config })

  const adminPassword = process.env.ZURIBEANS_ADMIN_PASSWORD || 'change-me'
  const svcPassword = process.env.ZURIBEANS_SVC_PASSWORD || 'change-me'

  // 1–2. Platform context entities
  const tenant = await ensureTenant(payload)
  const tenantId = String(tenant.id)

  const org = await ensureOrganisation(payload, tenantId)
  const orgId = String(org.id)

  // 3. Markets (ZA is default; UG secondary)
  const marketZa = await ensureMarket(payload, {
    tenantId,
    orgId,
    code: MARKET_ZA_CODE,
    name: 'Zuribeans South Africa',
    currency: 'ZAR',
    geography: ['ZA'],
  })
  const marketUg = await ensureMarket(payload, {
    tenantId,
    orgId,
    code: MARKET_UG_CODE,
    name: 'Zuribeans Uganda',
    currency: 'UGX',
    geography: ['UG'],
  })
  const marketZaId = String(marketZa.id)
  const marketUgId = String(marketUg.id)

  // 4. Digital estate (default market = ZA)
  const estate = await ensureDigitalEstate(payload, {
    tenantId,
    defaultMarketId: marketZaId,
  })
  const estateId = String(estate.id)

  // 5. Human content administrator for Zuribeans (not platform admin).
  //    Roles/capabilities from src/baobab/authorization/roles.ts
  await ensureUser(payload, {
    email: CONTENT_ADMIN_EMAIL,
    password: adminPassword,
    tenantId,
    legalEntityId: orgId,
    digitalEstateId: estateId,
    marketIds: [marketZaId, marketUgId],
    editorialRoles: [EditorialRole.CONTENT_ADMINISTRATOR, EditorialRole.PUBLISHER],
    capabilities: [
      Capability.CONTENT_MANAGEMENT,
      Capability.CONTENT_EDITORIAL_PRODUCT,
      Capability.CONTENT_PUBLISH,
      Capability.CONTENT_MEDIA,
    ],
    serviceIdentity: false,
  })

  // 6. Interim machine identity for estate → CMS composition.
  //    Replace with Keycloak workload client when CMS OIDC is available.
  await ensureUser(payload, {
    email: SERVICE_USER_EMAIL,
    password: svcPassword,
    tenantId,
    legalEntityId: orgId,
    digitalEstateId: estateId,
    marketIds: [marketZaId, marketUgId],
    editorialRoles: [EditorialRole.VIEWER],
    capabilities: [Capability.CONTENT_DELIVERY],
    serviceIdentity: true,
  })

  // 7–8. Bootstrap editorial content
  await ensureHomePage(payload, {
    tenantId,
    orgId,
    estateId,
    marketZaId,
  })

  await ensureProductStubs(payload, {
    tenantId,
    estateId,
    marketZaId,
  })

  console.log('\n=== Seed complete ===')
  console.log('Summary IDs (store outside git if needed for estate wiring):')
  console.log(
    JSON.stringify(
      {
        tenantId,
        organisationId: orgId,
        digitalEstateId: estateId,
        marketZaId,
        marketUgId,
        contentAdminEmail: CONTENT_ADMIN_EMAIL,
        serviceUserEmail: SERVICE_USER_EMAIL,
        note: 'Generate API key for service user in Admin UI → Users → API Key',
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

main().catch((error) => {
  console.error('Zuribeans onboarding seed failed', error)
  process.exit(1)
})
