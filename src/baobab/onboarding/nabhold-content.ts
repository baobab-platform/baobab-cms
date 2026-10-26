import type { EstateProfile } from './profiles.js';
import { NABHOLD, type Mode, type OnboardingReport, type ProjectionRepository, type StepResult } from './nabhold.js';

/**
 * DRAFT-only starter content for the Nabhold corporate estate: home, navigation,
 * footer, site-settings and group-profile.
 *
 * Rules:
 * - every record is created as DRAFT; nothing is published here;
 * - a record that already exists in any state is left untouched (editors own
 *   content once it exists), so a re-run never overwrites editor work;
 * - every statement is limited to what is already true and approved: the
 *   display name and routes the estate actually has. No mission, history,
 *   portfolio, financial, registration, tax or address claim is made;
 * - links point only at routes that exist in the Nabhold estate.
 */

export interface ContentSeedRepository extends ProjectionRepository {
  /** Records for (tenant, contentKey), plus `kind` for site-configurations. */
  findScoped(collection: string, tenantId: string, contentKey: string, kind?: string, scope?: { digitalEstateId: string; locale: string }): Promise<Array<Record<string, unknown> & { id: string | number }>>;
}

const LINKS = {
  group: { label: 'About the group', href: '/about/group' },
  portfolio: { label: 'Portfolio', href: '/portfolio' },
  sectors: { label: 'Sectors', href: '/sectors' },
  insights: { label: 'Insights', href: '/insights' },
} as const;

export interface SeedSpec {
  contentKey: 'home' | 'navigation' | 'footer' | 'site-settings' | 'group-profile';
  collection: 'pages' | 'site-configurations';
  kind?: string;
  fields: Record<string, unknown>;
}

export const SEEDS: SeedSpec[] = [
  {
    contentKey: 'home',
    collection: 'pages',
    fields: {
      title: 'Home',
      slug: 'home',
      status: 'draft',
      headline: NABHOLD.registryName,
      primaryCta: { ...LINKS.group },
      secondaryCta: { ...LINKS.insights },
    },
  },
  {
    contentKey: 'navigation',
    collection: 'site-configurations',
    kind: 'navigation',
    fields: { title: 'Navigation', navigationItems: [LINKS.group, LINKS.portfolio, LINKS.sectors, LINKS.insights].map((l) => ({ ...l })) },
  },
  {
    contentKey: 'footer',
    collection: 'site-configurations',
    kind: 'footer',
    fields: { title: 'Footer', statement: NABHOLD.registryName, footerLinks: [{ ...LINKS.group }] },
  },
  {
    contentKey: 'site-settings',
    collection: 'site-configurations',
    kind: 'site-settings',
    fields: { title: 'Site settings', siteName: NABHOLD.registryName },
  },
  {
    contentKey: 'group-profile',
    collection: 'site-configurations',
    kind: 'group-profile',
    fields: {
      title: 'The group',
      body: [{ type: 'paragraph', text: 'This page will be completed with content approved by the company.' }],
    },
  },
];

export async function seedEstateContent(
  repo: ContentSeedRepository,
  profile: EstateProfile,
  seeds: readonly SeedSpec[],
  options: { mode: Mode; projectionMode: 'local' | 'none'; environment: 'production' | 'non-production'; contentScope?: 'DIGITAL_ESTATE' | 'MARKET' },
): Promise<OnboardingReport> {
  const steps: StepResult[] = [];
  const blockers: string[] = [];
  const ids: Record<string, string> = {};
  const writing = options.mode === 'apply';
  const done = (): OnboardingReport => ({
    mode: options.mode,
    environment: options.environment,
    projectionMode: options.projectionMode,
    steps,
    converged: blockers.length === 0 && steps.every((s) => s.action === 'exists' || s.action === 'warning' || (writing && s.action === 'create')),
    blockers,
    ids,
  });

  if (writing) {
    if (options.environment === 'production') blockers.push('PRODUCTION_REQUIRES_CONTROL_PLANE: starter content is never seeded in production.');
    if (options.projectionMode !== 'local') blockers.push('PROJECTION_MODE_REQUIRED: pass --projection-mode local in a development or test environment.');
    if (blockers.length > 0) {
      steps.push({ step: 'preconditions', collection: '-', action: 'blocked', detail: blockers.join(' ') });
      return done();
    }
  }

  const one = async (collection: string, field: string, value: string) => {
    const rows = await repo.find(collection, field, value, 2);
    return rows.length === 1 ? rows[0] : undefined;
  };
  const tenant = await one('tenants', 'code', profile.tenantCode);
  const org = await one('organisations', 'code', profile.organisationCode);
  const estate = await one('digital-estates', 'code', profile.estateCode);
  const market = await one('markets', 'code', profile.marketCode);
  if (!tenant || !org || !estate || !market) {
    blockers.push('PREREQUISITES_MISSING: run scripts/onboarding/nabhold.ts first (tenant, organisation, market and digital estate must exist once).');
    steps.push({ step: 'prerequisites', collection: '-', action: 'blocked', detail: blockers[0] });
    return done();
  }

  const relation = (value: unknown) => typeof value === 'object' && value !== null ? String((value as { id?: unknown }).id) : String(value);
  if (tenant.status !== 'active' || org.status !== 'active' || estate.status !== 'active' || market.enabled !== true ||
      [org, estate, market].some(row => relation(row.tenant) !== String(tenant.id)) ||
      relation(market.legalEntity) !== String(org.id) || relation(estate.defaultMarket) !== String(market.id)) {
    blockers.push('PREREQUISITES_WRONG_OWNER: tenant, organisation, market and estate must belong to the same configured graph.');
    return done();
  }

  for (const seed of seeds) {
    const step = `content-${seed.contentKey}`;
    const found = await repo.findScoped(seed.collection, String(tenant.id), seed.contentKey, seed.kind, { digitalEstateId: String(estate.id), locale: profile.locale });
    // Check the port's result as well as its query. A faulty persistence adapter
    // cannot turn a neighbour's row into an owned fixture or editorial update.
    if (found.some(row => relation(row.tenant) !== String(tenant.id) || relation(row.digitalEstate) !== String(estate.id) ||
        relation(row.organisation) !== String(org.id) || relation(row.market) !== String(market.id) || row.locale !== profile.locale || row.contentKey !== seed.contentKey || (seed.kind && row.kind !== seed.kind))) {
      blockers.push('CONTENT_WRONG_OWNER: ' + seed.contentKey);
      continue;
    }
    if (found.length > 1) {
      const detail = `DUPLICATE: ${found.length} ${seed.collection} records carry contentKey "${seed.contentKey}"`;
      steps.push({ step, collection: seed.collection, action: 'mismatch', detail });
      blockers.push(detail);
      continue;
    }
    if (found.length === 1) {
      ids[step] = String(found[0].id);
      steps.push({ step, collection: seed.collection, action: 'exists' });
      continue;
    }
    if (options.mode === 'verify') {
      steps.push({ step, collection: seed.collection, action: 'missing' });
      blockers.push(`${step}: missing`);
      continue;
    }
    if (options.mode === 'dry-run') {
      steps.push({ step, collection: seed.collection, action: 'create', detail: 'planned DRAFT; nothing written' });
      continue;
    }
    const created = await repo.create(seed.collection, {
      ...seed.fields,
      ...(seed.kind ? { kind: seed.kind } : {}),
      contentKey: seed.contentKey,
      ...(seed.collection === 'site-configurations' ? { slug: seed.contentKey, publicationState: 'DRAFT' } : {}),
      tenant: tenant.id,
      organisation: org.id,
      digitalEstate: estate.id,
      market: market.id,
      locale: profile.locale,
      contentScope: options.contentScope ?? 'DIGITAL_ESTATE',
    });
    ids[step] = String(created.id);
    steps.push({ step, collection: seed.collection, action: 'create', detail: 'DRAFT' });
  }
  return done();
}

/** Nabhold remains DRAFT-only; the synthetic fixture controller is separate. */
export const seedNabholdContent = (repo: ContentSeedRepository, options: Parameters<typeof seedEstateContent>[3]) =>
  seedEstateContent(repo, NABHOLD, SEEDS, options);
