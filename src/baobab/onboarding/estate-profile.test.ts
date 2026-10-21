import type { TextField } from 'payload';
import { describe, expect, it } from 'vitest';
import { onboardNabhold } from './nabhold.js';
import { seedNabholdContent, type ContentSeedRepository } from './nabhold-content.js';
import { onboardSyntheticEstate, seedSyntheticContent, setSyntheticContentState, syntheticEstateProfile } from './estate-profile.js';
import { canonicalIdField } from '../identity/field.js';

type Row = Record<string, unknown> & { id: string };
function memory() {
  const store: Record<string, Row[]> = {};
  let n = 0;
  const repo: ContentSeedRepository = {
    async find(c, f, v, limit) { return (store[c] ?? []).filter(r => r[f] === v).slice(0, limit); },
    async findScoped(c, tenant, key, kind, scope) {
      return (store[c] ?? []).filter(r => r.tenant === tenant && r.contentKey === key && (!kind || r.kind === kind) &&
        (!scope || r.digitalEstate === scope.digitalEstateId && r.locale === scope.locale));
    },
    async create(c, data) { const row = { ...data, id: 'row-' + ++n }; (store[c] ??= []).push(row); return row; },
    async update(c, id, data) { const row = store[c].find(r => r.id === id)!; Object.assign(row, data); return row; },
  };
  return { store, repo };
}
const options = { mode: 'apply' as const, environment: 'non-production' as const, projectionMode: 'local' as const };
const profile = syntheticEstateProfile('0123456789abcdef');

describe('independently scoped estate profiles', () => {
  it('keeps canonical references explicitly unresolved and creates no substitute principal', async () => {
    const { repo, store } = memory();
    expect((await onboardSyntheticEstate(repo, profile, options)).converged).toBe(true);
    expect(profile.canonicalReferences).toEqual({ tenant: 'UNRESOLVED', organisation: 'UNRESOLVED',
      legalEntity: 'UNRESOLVED', market: 'UNRESOLVED', digitalEstate: 'UNRESOLVED' });
    expect(store.tenants[0].controlPlaneTenantId).toBeUndefined();
    expect(store.organisations[0].canonicalLegalEntityId).toBeUndefined();
    expect(store.markets[0].canonicalMarketId).toBeUndefined();
    expect(store['digital-estates'][0].canonicalDigitalEstateId).toBeUndefined();
    expect(store.users).toBeUndefined();
    expect((store.tenants[0].metadata as { authoritative: boolean }).authoritative).toBe(false);
    const before = JSON.stringify(store);
    expect((await onboardSyntheticEstate(repo, profile, options)).converged).toBe(true);
    expect(JSON.stringify(store)).toBe(before);
  });

  it('supports CP-supplied references without deriving IDs from local codes', async () => {
    const { repo, store } = memory();
    const id = '0199a1b2-c3d4-7e8f-9a0b-0000000000a1';
    const supplied = syntheticEstateProfile(profile.runId, { tenant: 'tn_abc123', organisation: id, legalEntity: id, market: 'mkt_unitfixture', digitalEstate: id });
    expect((await onboardSyntheticEstate(repo, supplied, options)).converged).toBe(true);
    expect(store.tenants[0].controlPlaneTenantId).toBe('tn_abc123');
    expect(store.organisations[0].controlPlaneOrganisationId).toBe(id);
    expect(store.markets[0].canonicalMarketId).toBe('mkt_unitfixture');
    expect(store['digital-estates'][0].canonicalDigitalEstateId).toBe(id);
    // These supplied unit values demonstrate copying only, never CP issuance.
    expect(() => syntheticEstateProfile(profile.runId, { tenant: 'nabhold' })).toThrow();
    expect(() => syntheticEstateProfile(profile.runId, { market: id })).toThrow();
    expect(() => syntheticEstateProfile(profile.runId, { organisation: 'NABHOLD' })).toThrow();
  });

  it('publishes, withdraws and restores drafts without touching Nabhold or another run', async () => {
    const { repo, store } = memory();
    await onboardNabhold(repo, { ...options, generateSecret: () => 'unused-local-test-credential' });
    await seedNabholdContent(repo, options);
    const nabhold = JSON.stringify(store);
    await onboardSyntheticEstate(repo, profile, options);
    await seedSyntheticContent(repo, profile, options);
    const other = syntheticEstateProfile('fedcba9876543210');
    await onboardSyntheticEstate(repo, other, options);
    await seedSyntheticContent(repo, other, options);
    const otherTenant = store.tenants.find(r => r.code === other.tenantCode)!.id;
    const neighbours = JSON.stringify(Object.values(store).flat().filter(r => r.tenant === otherTenant));
    for (const state of ['published', 'withdrawn', 'draft'] as const) {
      const receipt = await setSyntheticContentState(repo, profile, state, options);
      expect(receipt.humanEditorialApproval).toBe(false);
      expect(receipt.connectedQualification).toBe(false);
      const rows = await seedSyntheticContent(repo, profile, { ...options, mode: 'verify' });
      expect(rows.converged).toBe(true);
      expect(store.pages.find(r => r.id === rows.ids['content-home'])!.status).toBe(state === 'withdrawn' ? 'archived' : state);
    }
    const original = JSON.parse(nabhold) as typeof store;
    for (const [c, rows] of Object.entries(original)) for (const row of rows) expect(store[c].find(r => r.id === row.id)).toEqual(row);
    expect(JSON.stringify(Object.values(store).flat().filter(r => r.tenant === otherTenant))).toBe(neighbours);
    const count = store.pages.length;
    await seedSyntheticContent(repo, profile, options);
    expect(store.pages).toHaveLength(count);
  });

  it('refuses aliasing a CP reference already owned by Nabhold before creating any row', async () => {
    const { repo, store } = memory();
    await onboardNabhold(repo, { ...options, controlPlaneTenantId: 'tn_existing', generateSecret: () => 'unused' });
    const before = JSON.stringify(store);
    const alias = syntheticEstateProfile(profile.runId, { tenant: 'tn_existing' });
    expect((await onboardSyntheticEstate(repo, alias, options)).blockers.join(' ')).toContain('CANONICAL_REFERENCE_ALREADY_OWNED');
    expect(JSON.stringify(store)).toBe(before);
  });

  it('checks matching-code canonical rows ownership before creating a missing namespace root', async () => {
    const id = '0199a1b2-c3d4-7e8f-9a0b-0000000000a1';
    for (const [collection, code, field, refs] of [
      ['organisations', profile.organisationCode, 'canonicalLegalEntityId', { legalEntity: id }],
      ['organisations', profile.organisationCode, 'controlPlaneOrganisationId', { organisation: id }],
      ['markets', profile.marketCode, 'canonicalMarketId', { market: 'mkt_foreign' }],
      ['digital-estates', profile.estateCode, 'canonicalDigitalEstateId', { digitalEstate: id }],
    ] as const) {
      const { repo, store } = memory();
      const value = Object.values(refs)[0];
      store[collection] = [{ id: 'foreign-child', code, [field]: value, tenant: 'subsidiary-tenant' }];
      const before = JSON.stringify(store);
      const selected = syntheticEstateProfile(profile.runId, refs);
      expect((await onboardSyntheticEstate(repo, selected, options)).converged).toBe(false);
      expect(JSON.stringify(store)).toBe(before);
      expect(store.tenants).toBeUndefined();
    }
  });

  it('refuses altered selectors, extra fields, production and absent local mode before writes', async () => {
    const { repo, store } = memory();
    for (const changed of [{ ...profile, tenantCode: 'nabhold' }, { ...profile, serviceEmail: 'borrowed@example.test' },
      { ...profile, extra: true }, { ...profile, seeds: [] }]) {
      await expect(onboardSyntheticEstate(repo, changed, options)).rejects.toThrow();
    }
    await expect(onboardSyntheticEstate(repo, profile, { ...options, environment: 'production' })).rejects.toThrow();
    await expect(onboardSyntheticEstate(repo, profile, { ...options, projectionMode: 'none' })).rejects.toThrow();
    expect(store).toEqual({});
    expect(Object.isFrozen(profile.seeds[0].fields)).toBe(true);
  });

  it('refuses duplicate, cross-tenant and wrong-organisation prerequisite graphs without repair', async () => {
    for (const changed of ['duplicate', 'tenant', 'organisation', 'estate'] as const) {
      const { repo, store } = memory();
      await onboardSyntheticEstate(repo, profile, options);
      if (changed === 'duplicate') store.tenants.push({ ...store.tenants[0], id: 'dup' });
      if (changed === 'tenant') store.markets[0].tenant = 'subsidiary-tenant';
      if (changed === 'organisation') store.markets[0].legalEntity = 'subsidiary-org';
      if (changed === 'estate') store['digital-estates'][0].tenant = 'neighbour';
      const before = JSON.stringify(store);
      expect((await seedSyntheticContent(repo, profile, options)).converged).toBe(false);
      expect((await onboardSyntheticEstate(repo, profile, options)).converged).toBe(false);
      expect(JSON.stringify(store)).toBe(before);
    }
  });

  it('refuses fixture publication after a tenant, organisation, estate or market is disabled', async () => {
    for (const [collection, field, value] of [['tenants', 'status', 'inactive'], ['organisations', 'status', 'inactive'],
      ['digital-estates', 'status', 'inactive'], ['markets', 'enabled', false]] as const) {
      const { repo, store } = memory();
      await onboardSyntheticEstate(repo, profile, options);
      await seedSyntheticContent(repo, profile, options);
      store[collection][0][field] = value;
      const before = JSON.stringify(store);
      await expect(setSyntheticContentState(repo, profile, 'published', options)).rejects.toThrow();
      expect(JSON.stringify(store)).toBe(before);
    }
  });

  it('refuses blank tenant-ID fills before inspecting disabled descendants', async () => {
    for (const [collection, field, value] of [['organisations', 'status', 'inactive'],
      ['digital-estates', 'status', 'inactive'], ['markets', 'enabled', false]] as const) {
      const { repo, store } = memory();
      await onboardSyntheticEstate(repo, profile, options);
      store[collection][0][field] = value;
      const before = JSON.stringify(store);
      const supplied = syntheticEstateProfile(profile.runId, { tenant: 'tn_unitfixture' });
      expect((await onboardSyntheticEstate(repo, supplied, options)).converged).toBe(false);
      expect(JSON.stringify(store)).toBe(before);
    }
  });

  it('never labels altered editorial data as a CMS-owned publication fixture', async () => {
    for (const changed of ['title', 'introduction', 'content', 'navigation', 'footer', 'scope', 'effective'] as const) {
      const { repo, store } = memory();
      await onboardSyntheticEstate(repo, profile, options);
      await seedSyntheticContent(repo, profile, options);
      if (changed === 'title') store.pages[0].title = 'Editor-owned replacement';
      if (changed === 'introduction') store.pages[0].introduction = 'Editor amendment';
      if (changed === 'content') store.pages[0].content = { root: { children: [{ text: 'Editor story' }] } };
      if (changed === 'navigation') store['site-configurations'][0].navigationItems = [{ label: 'Editor route', href: '/edited' }];
      if (changed === 'footer') store['site-configurations'][1].tagline = 'Editor addition';
      if (changed === 'scope') store.pages[0].contentScope = 'TENANT';
      if (changed === 'effective') store.pages[0].effectiveFrom = '2026-10-21T00:00:00Z';
      const before = JSON.stringify(store);
      await expect(setSyntheticContentState(repo, profile, 'published', options)).rejects.toThrow();
      await expect(setSyntheticContentState(repo, profile, 'withdrawn', options)).rejects.toThrow();
      expect(JSON.stringify(store)).toBe(before);
    }
  });

  it('scopes duplicate detection to estate and locale and rejects a lying repository adapter', async () => {
    const { repo, store } = memory();
    await onboardSyntheticEstate(repo, profile, options);
    await seedSyntheticContent(repo, profile, options);
    const home = store.pages[0];
    store.pages.push({ ...home, id: 'other-estate', digitalEstate: 'another-estate' }, { ...home, id: 'other-locale', locale: 'fr-FR' });
    expect((await seedSyntheticContent(repo, profile, { ...options, mode: 'verify' })).converged).toBe(true);
    const faulty = { ...repo, findScoped: async () => [store.pages[1]] };
    await expect(setSyntheticContentState(faulty, profile, 'published', options)).rejects.toThrow();
    expect(home.status).toBe('draft');
    store.pages.push({ ...home, id: 'duplicate' });
    await expect(setSyntheticContentState(repo, profile, 'published', options)).rejects.toThrow();
    expect(home.status).toBe('draft');
  });

  it('leaves CP-owned canonical fields unresolved while retaining CMS-owned ID issuance', () => {
    const hook = (authority: 'cms' | 'control-plane') => (canonicalIdField({ entityType: 'TEST', authority }) as TextField).hooks!.beforeChange![0];
    expect(hook('control-plane')({ operation: 'create' } as never)).toBeUndefined();
    expect(hook('control-plane')({ operation: 'update', value: 'changed', originalDoc: { canonicalEntityId: 'issued' } } as never)).toBe('issued');
    expect(hook('cms')({ operation: 'create' } as never)).toMatch(/^[0-9a-f-]{36}$/);
  });
});
