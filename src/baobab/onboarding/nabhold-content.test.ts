import { describe, expect, it } from 'vitest';
import { SEEDS, seedNabholdContent, type ContentSeedRepository } from './nabhold-content.js';
import { validateLinkTarget } from '../../collections/SiteConfigurations.js';

type Row = Record<string, unknown> & { id: string };

function repoWith(prereq = true) {
  const store: Record<string, Row[]> = prereq
    ? {
        tenants: [{ id: 't1', code: 'nabhold' }],
        organisations: [{ id: 'o1', code: 'nabhold' }],
        'digital-estates': [{ id: 'e1', code: 'nabhold-corporate' }],
        markets: [{ id: 'm1', code: 'nabhold_za' }],
      }
    : {};
  let n = 0;
  const repo: ContentSeedRepository = {
    async find(c, f, v, limit) {
      return (store[c] ?? []).filter((r) => String(r[f]) === v).slice(0, limit);
    },
    async findScoped(c, tenantId, key, kind) {
      return (store[c] ?? []).filter((r) => r.tenant === tenantId && r.contentKey === key && (!kind || r.kind === kind));
    },
    async create(c, data) {
      const row = { ...data, id: `c${++n}` } as Row;
      (store[c] ??= []).push(row);
      return row;
    },
    async update() {
      throw new Error('never');
    },
  };
  return { repo, store };
}
const base = { projectionMode: 'local' as const, environment: 'non-production' as const };

describe('seedNabholdContent', () => {
  it('dry-run writes nothing and plans five DRAFT records', async () => {
    const { repo, store } = repoWith();
    const report = await seedNabholdContent(repo, { ...base, mode: 'dry-run' });
    expect(report.steps.filter((s) => s.action === 'create')).toHaveLength(5);
    expect(store.pages).toBeUndefined();
    expect(store['site-configurations']).toBeUndefined();
  });

  it('apply creates DRAFT-only records scoped to the Nabhold estate, then is idempotent', async () => {
    const { repo, store } = repoWith();
    const first = await seedNabholdContent(repo, { ...base, mode: 'apply' });
    expect(first.converged).toBe(true);
    expect(store.pages).toHaveLength(1);
    expect(store['site-configurations']).toHaveLength(4);
    expect(store.pages[0].status).toBe('draft');
    for (const row of store['site-configurations']) {
      expect(row.publicationState).toBe('DRAFT');
      expect(row.contentScope).toBe('DIGITAL_ESTATE');
      expect(row.tenant).toBe('t1');
      expect(row.locale).toBe('en-ZA');
    }
    const second = await seedNabholdContent(repo, { ...base, mode: 'apply' });
    expect(second.steps.every((s) => s.action === 'exists')).toBe(true);
    expect(store['site-configurations']).toHaveLength(4);
    expect((await seedNabholdContent(repo, { ...base, mode: 'verify' })).converged).toBe(true);
  });

  it('never overwrites editor-authored or published content', async () => {
    const { repo, store } = repoWith();
    await seedNabholdContent(repo, { ...base, mode: 'apply' });
    const nav = store['site-configurations'].find((r) => r.kind === 'navigation')!;
    nav.publicationState = 'PUBLISHED';
    nav.navigationItems = [{ label: 'Edited', href: '/edited' }];
    await seedNabholdContent(repo, { ...base, mode: 'apply' });
    expect(nav.publicationState).toBe('PUBLISHED');
    expect(nav.navigationItems).toEqual([{ label: 'Edited', href: '/edited' }]);
  });

  it('refuses production and a missing projection mode', async () => {
    const { repo, store } = repoWith();
    const prod = await seedNabholdContent(repo, { ...base, mode: 'apply', environment: 'production' });
    expect(prod.blockers[0]).toContain('PRODUCTION_REQUIRES_CONTROL_PLANE');
    const none = await seedNabholdContent(repo, { ...base, mode: 'apply', projectionMode: 'none' });
    expect(none.blockers[0]).toContain('PROJECTION_MODE_REQUIRED');
    expect(store.pages).toBeUndefined();
  });

  it('blocks when the onboarding prerequisites are missing', async () => {
    const { repo, store } = repoWith(false);
    const report = await seedNabholdContent(repo, { ...base, mode: 'apply' });
    expect(report.converged).toBe(false);
    expect(report.blockers[0]).toContain('PREREQUISITES_MISSING');
    expect(store.pages).toBeUndefined();
  });

  it('reports a duplicate instead of choosing one', async () => {
    const { repo, store } = repoWith();
    await seedNabholdContent(repo, { ...base, mode: 'apply' });
    store['site-configurations'].push({ ...store['site-configurations'][0], id: 'dup' });
    const report = await seedNabholdContent(repo, { ...base, mode: 'verify' });
    expect(report.converged).toBe(false);
    expect(report.blockers.join(' ')).toContain('DUPLICATE');
  });

  it('verify reports missing records', async () => {
    const { repo } = repoWith();
    expect((await seedNabholdContent(repo, { ...base, mode: 'verify' })).converged).toBe(false);
  });
});

describe('seed content is truthful and safe', () => {
  const text = JSON.stringify(SEEDS);

  it('covers exactly the five required keys', () => {
    expect(SEEDS.map((s) => s.contentKey)).toEqual(['home', 'navigation', 'footer', 'site-settings', 'group-profile']);
  });

  it('makes no registration, tax, address, financial or ownership claim', () => {
    expect(text).not.toMatch(/\d{4}\/\d{6}\/\d{2}|9470182230|VAT|tax|registered|address|director|shareholder|revenue|founded|since \d{4}|leading|largest/i);
  });

  it('links only to routes the estate has, and every link validates', () => {
    const routes = new Set(['/about/group', '/portfolio', '/sectors', '/insights']);
    const hrefs = [...text.matchAll(/"href":"([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length).toBeGreaterThan(0);
    for (const href of hrefs) {
      expect(routes.has(href), href).toBe(true);
      expect(validateLinkTarget(href)).toBe(true);
    }
  });

  it('never sets a published state', () => {
    expect(text).not.toMatch(/PUBLISHED|"published"/);
  });
});
