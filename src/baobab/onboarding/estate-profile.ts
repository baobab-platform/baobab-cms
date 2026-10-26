import { contentDataForKey } from '../content-resolution/payload-source.js';
import { isDeepStrictEqual } from 'node:util';
import { onboardEstate, type OnboardingOptions, type ProjectionRepository } from './estate.js';
import { seedEstateContent, type ContentSeedRepository, type SeedSpec } from './nabhold-content.js';
import type { EstateProfile } from './profiles.js';

const UNRESOLVED = 'UNRESOLVED' as const;
type Reference = string;
export interface CanonicalReferences {
  tenant: Reference;
  organisation: Reference;
  legalEntity: Reference;
  market: Reference;
  digitalEstate: Reference;
}
export interface SyntheticEstateProfile extends EstateProfile {
  readonly synthetic: true;
  readonly runId: string;
  /** Supplied CP references remain separate from Payload row IDs. UNRESOLVED
   * is never written to an authoritative identifier field. */
  readonly canonicalReferences: Readonly<CanonicalReferences>;
  readonly seeds: readonly SeedSpec[];
}
// CP Market Registry issues mkt_ identifiers (Shared market/v1), not UUIDs.
const marketId = /^mkt_[a-z0-9]{1,59}$/;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}

/** Only this fixed synthetic namespace can use the fixture controller. No
 * principal, binding, domain, entitlement or legal ownership is created. */
export function syntheticEstateProfile(runId: string, supplied: Partial<CanonicalReferences> = {}): SyntheticEstateProfile {
  if (!/^[0-9a-f]{16}$/.test(runId)) throw new Error('Invalid synthetic run id');
  const refs: CanonicalReferences = { tenant: UNRESOLVED, organisation: UNRESOLVED,
    legalEntity: UNRESOLVED, market: UNRESOLVED, digitalEstate: UNRESOLVED };
  for (const key of Object.keys(supplied)) {
    if (!Object.hasOwn(refs, key)) throw new Error('Unknown canonical reference');
    const name = key as keyof CanonicalReferences;
    const value = supplied[name];
    // CP's ADR-SHARED-043 disposable bootstrap deliberately represents its
    // unverified synthetic legal actor with a DEV-... reference, not a UUID.
    // Only this exact run-bound Nabhold fixture marker is admissible here.
    // Production references and other actors are never relaxed.
    const developmentLegalActor = name === 'legalEntity' &&
      value === `DEV-${runId.slice(0, 12)}-NABHOLD`;
    if (typeof value !== 'string' || value !== UNRESOLVED && !(name === 'tenant'
      ? /^tn_[a-z0-9]+$/.test(value) : name === 'market' ? marketId.test(value)
      : uuid.test(value) || developmentLegalActor)) {
      throw new Error('Invalid supplied CP reference');
    }
    refs[name] = value;
  }
  const prefix = 'int03-' + runId;
  const label = 'Synthetic INT-03 estate';
  return freeze({ synthetic: true, runId, canonicalReferences: refs,
    registryName: label, tenantCode: prefix + '-tenant', organisationCode: prefix + '-org',
    estateCode: prefix + '-estate', marketCode: prefix + '-market', marketName: 'Synthetic ZA market',
    estateName: label, locale: 'en-ZA', currency: 'ZAR', geography: ['ZA'], maxProjectionAgeMs: 90 * 60 * 1000,
    ...(refs.legalEntity !== UNRESOLVED ? { firstPartyId: refs.legalEntity } : {}),
    seeds: ([
      { contentKey: 'home', collection: 'pages', fields: { title: label, slug: 'home', status: 'draft',
        eyebrow: 'Synthetic qualification data', headline: label, introduction: 'Disposable content for integration checks.',
        institutionalStatement: 'No real legal, commercial or portfolio facts are represented.',
        primaryCta: { label: 'About', href: '/about/group' }, secondaryCta: { label: 'Insights', href: '/insights' } } },
      { contentKey: 'navigation', collection: 'site-configurations', kind: 'navigation', fields: { title: 'Synthetic navigation',
        navigationItems: [{ label: 'About', href: '/about/group' }, { label: 'Insights', href: '/insights' }] } },
      { contentKey: 'footer', collection: 'site-configurations', kind: 'footer', fields: { title: 'Synthetic footer',
        statement: 'Disposable synthetic qualification content.', tagline: 'Synthetic development fixture', footerLinks: [{ label: 'About', href: '/about/group' }] } },
      { contentKey: 'site-settings', collection: 'site-configurations', kind: 'site-settings', fields: { title: 'Synthetic settings', siteName: label } },
      { contentKey: 'group-profile', collection: 'site-configurations', kind: 'group-profile', fields: { title: 'Synthetic group',
        body: [{ type: 'paragraph', text: 'A synthetic group profile with no ownership or subsidiary assertions.' }] } },
    ] satisfies SeedSpec[]).map(seed => ({ ...seed, fields: { ...seed.fields,
      // These are explicit fixture data, matching the maintained corporate
      // collection defaults; provenance comparison never discards SEO changes.
      ...(seed.collection === 'site-configurations' ? { visibility: 'public', seo: { robots: { index: true, follow: true } } } : {}),
    } })),
  });
}
export function validateSyntheticProfile(profile: SyntheticEstateProfile): void {
  if (!isDeepStrictEqual(profile, syntheticEstateProfile(profile.runId, profile.canonicalReferences))) {
    throw new Error('Changed synthetic profile');
  }
}
type FixtureOptions = Pick<OnboardingOptions, 'mode' | 'environment' | 'projectionMode'>;
function boundary(profile: SyntheticEstateProfile, options: FixtureOptions) {
  validateSyntheticProfile(profile);
  if (options.environment !== 'non-production' || options.projectionMode !== 'local') throw new Error('Development local fixture required');
}
async function verifyReferences(repo: ProjectionRepository, profile: SyntheticEstateProfile) {
  for (const [collection, code, field, expected] of [
    ['tenants', profile.tenantCode, 'controlPlaneTenantId', profile.canonicalReferences.tenant],
    ['organisations', profile.organisationCode, 'controlPlaneOrganisationId', profile.canonicalReferences.organisation],
    ['organisations', profile.organisationCode, 'canonicalLegalEntityId', profile.canonicalReferences.legalEntity],
    ['markets', profile.marketCode, 'canonicalMarketId', profile.canonicalReferences.market],
    ['digital-estates', profile.estateCode, 'canonicalDigitalEstateId', profile.canonicalReferences.digitalEstate],
  ]) {
    const rows = await repo.find(collection, 'code', code, 2);
    if (rows.some(row => row[field] && row[field] !== expected)) throw new Error('Synthetic canonical reference differs');
  }
}
export async function onboardSyntheticEstate(repo: ProjectionRepository, profile: SyntheticEstateProfile, options: FixtureOptions) {
  boundary(profile, options);
  await verifyReferences(repo, profile);
  const refs = profile.canonicalReferences;
  return onboardEstate(repo, profile, { ...options,
    ...(refs.tenant !== UNRESOLVED ? { controlPlaneTenantId: refs.tenant } : {}),
    ...(refs.organisation !== UNRESOLVED ? { controlPlaneOrganisationId: refs.organisation } : {}),
    controlPlaneMarketId: refs.market === UNRESOLVED ? undefined : refs.market,
    controlPlaneDigitalEstateId: refs.digitalEstate === UNRESOLVED ? undefined : refs.digitalEstate,
    generateSecret: () => { throw new Error('Synthetic profiles never create workload users'); },
  });
}
export async function seedSyntheticContent(repo: ContentSeedRepository, profile: SyntheticEstateProfile, options: FixtureOptions) {
  boundary(profile, options);
  await verifyReferences(repo, profile);
  // A supplied CP Market narrows this disposable fixture. The record's
  // declared scope must carry that dimension through native delivery so an
  // exact Market consumer never has to accept estate-wide fallback content.
  return seedEstateContent(repo, profile, profile.seeds, { ...options,
    contentScope: profile.canonicalReferences.market === UNRESOLVED ? 'DIGITAL_ESTATE' : 'MARKET' });
}

/** CMS-owned publication of disposable fixtures, never human editorial approval.
 * Resolve and check the complete graph before any write; a caller cannot supply
 * arbitrary row IDs or select Nabhold content. Actual Payload hooks still run. */
export async function setSyntheticContentState(repo: ContentSeedRepository, profile: SyntheticEstateProfile,
  state: 'draft' | 'published' | 'withdrawn', options: FixtureOptions) {
  boundary(profile, options);
  if (options.mode !== 'apply' || !['draft', 'published', 'withdrawn'].includes(state)) throw new Error('Explicit fixture apply required');
  const report = await seedSyntheticContent(repo, profile, { ...options, mode: 'verify' });
  if (!report.converged) throw new Error('Synthetic content ownership or convergence failed');
  // Validate every fixture before the first publication write. Scope/key alone
  // does not make editor-authored or altered content a CMS-owned fixture. The
  // actual delivery projection ignores only Payload array-row IDs/empty defaults.
  for (const seed of profile.seeds) {
    const tenants = await repo.find('tenants', 'code', profile.tenantCode, 2);
    const estates = await repo.find('digital-estates', 'code', profile.estateCode, 2);
    if (tenants.length !== 1 || estates.length !== 1) throw new Error('Fixture namespace changed');
    const rows = await repo.findScoped(seed.collection, String(tenants[0].id), seed.contentKey, seed.kind,
      { digitalEstateId: String(estates[0].id), locale: profile.locale });
    if (rows.length !== 1 || String(rows[0].id) !== report.ids['content-' + seed.contentKey] ||
        !isDeepStrictEqual(contentDataForKey(seed.contentKey, rows[0]), contentDataForKey(seed.contentKey, seed.fields)) ||
        rows[0].contentScope !== (profile.canonicalReferences.market === UNRESOLVED ? 'DIGITAL_ESTATE' : 'MARKET') || rows[0].effectiveFrom || rows[0].effectiveTo ||
        (rows[0].regions != null && (!Array.isArray(rows[0].regions) || rows[0].regions.length > 0)) ||
        (rows[0].visibility != null && rows[0].visibility !== 'public')) throw new Error('SYNTHETIC_FIXTURE_CHANGED:' + seed.contentKey);
  }
  for (const seed of profile.seeds) {
    await repo.update(seed.collection, report.ids['content-' + seed.contentKey], seed.collection === 'pages'
      ? { status: state === 'withdrawn' ? 'archived' : state }
      : { publicationState: state === 'draft' ? 'DRAFT' : state === 'published' ? 'PUBLISHED' : 'UNPUBLISHED' });
  }
  return { evidenceClass: 'CMS_OWNED_DISPOSABLE_FIXTURE', humanEditorialApproval: false, connectedQualification: false, state };
}
