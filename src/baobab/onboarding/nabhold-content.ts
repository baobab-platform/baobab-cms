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
  findScoped(collection: string, tenantId: string, contentKey: string, kind?: string): Promise<Array<Record<string, unknown> & { id: string | number }>>;
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

export async function seedNabholdContent(
  repo: ContentSeedRepository,
  options: { mode: Mode; projectionMode: 'local' | 'none'; environment: 'production' | 'non-production' },
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
  const tenant = await one('tenants', 'code', NABHOLD.tenantCode);
  const org = await one('organisations', 'code', NABHOLD.organisationCode);
  const estate = await one('digital-estates', 'code', NABHOLD.estateCode);
  const market = await one('markets', 'code', NABHOLD.marketCode);
  if (!tenant || !org || !estate || !market) {
    blockers.push('PREREQUISITES_MISSING: run scripts/onboarding/nabhold.ts first (tenant, organisation, market and digital estate must exist once).');
    steps.push({ step: 'prerequisites', collection: '-', action: 'blocked', detail: blockers[0] });
    return done();
  }

  for (const seed of SEEDS) {
    const step = `content-${seed.contentKey}`;
    const found = await repo.findScoped(seed.collection, String(tenant.id), seed.contentKey, seed.kind);
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
      locale: NABHOLD.locale,
      contentScope: 'DIGITAL_ESTATE',
    });
    ids[step] = String(created.id);
    steps.push({ step, collection: seed.collection, action: 'create', detail: 'DRAFT' });
  }
  return done();
}
