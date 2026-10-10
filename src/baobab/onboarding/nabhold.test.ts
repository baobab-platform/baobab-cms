import { describe, expect, it } from 'vitest';
import { detectEnvironment, NABHOLD, onboardNabhold, type ProjectionRepository } from './nabhold.js';

type Row = Record<string, unknown> & { id: string };

function memoryRepo(seed: Record<string, Row[]> = {}) {
  const store: Record<string, Row[]> = JSON.parse(JSON.stringify(seed));
  let n = 0;
  const repo: ProjectionRepository = {
    async find(collection, field, value, limit) {
      return (store[collection] ?? []).filter((r) => String(r[field]) === value).slice(0, limit);
    },
    async create(collection, data) {
      const row = { ...data, id: `id-${++n}` } as Row;
      (store[collection] ??= []).push(row);
      return row;
    },
    async update(collection, id, data) {
      const row = (store[collection] ?? []).find((r) => r.id === id)!;
      Object.assign(row, data);
      return row;
    },
  };
  return { repo, store };
}

const base = {
  projectionMode: 'local' as const,
  environment: 'non-production' as const,
  generateSecret: () => 'throwaway-secret-value',
  now: () => new Date('2026-10-09T00:00:00Z'),
};

describe('onboardNabhold', () => {
  it('dry-run plans creates and writes nothing', async () => {
    const { repo, store } = memoryRepo();
    const report = await onboardNabhold(repo, { ...base, mode: 'dry-run' });
    expect(Object.keys(store)).toHaveLength(0);
    expect(report.steps.filter((s) => s.action === 'create').length).toBeGreaterThanOrEqual(5);
    expect(report.blockers).toEqual([]);
  });

  it('apply creates the projection set and converges', async () => {
    const { repo, store } = memoryRepo();
    const report = await onboardNabhold(repo, { ...base, mode: 'apply' });
    expect(report.converged).toBe(true);
    expect(store.tenants[0].isProjection).toBe(true);
    expect((store.tenants[0].metadata as { authoritative: boolean }).authoritative).toBe(false);
    expect(store.organisations[0].canonicalLegalEntityId).toBe('NABHOLD');
    expect(store.markets[0].geography).toEqual(['ZA']);
    expect(store.markets[0].currency).toBe('ZAR');
    expect(store['digital-estates'][0].domains).toEqual([]);
  });

  it('is idempotent and verifiable', async () => {
    const { repo, store } = memoryRepo();
    await onboardNabhold(repo, { ...base, mode: 'apply' });
    const counts = Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v.length]));
    const again = await onboardNabhold(repo, { ...base, mode: 'apply' });
    expect(Object.fromEntries(Object.entries(store).map(([k, v]) => [k, v.length]))).toEqual(counts);
    expect(again.steps.some((s) => s.action === 'create')).toBe(false);
    const verify = await onboardNabhold(repo, { ...base, mode: 'verify' });
    expect(verify.converged).toBe(true);
  });

  it('resumes after a partial run', async () => {
    const { repo, store } = memoryRepo();
    await onboardNabhold(repo, { ...base, mode: 'apply' });
    store.markets = [];
    store['digital-estates'] = [];
    const report = await onboardNabhold(repo, { ...base, mode: 'apply' });
    expect(report.converged).toBe(true);
    expect(store.markets).toHaveLength(1);
    expect(store.tenants).toHaveLength(1);
  });

  it('refuses to write in production', async () => {
    const { repo, store } = memoryRepo();
    const report = await onboardNabhold(repo, { ...base, mode: 'apply', environment: 'production' });
    expect(report.converged).toBe(false);
    expect(report.blockers[0]).toContain('PRODUCTION_REQUIRES_CONTROL_PLANE');
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('refuses to write without explicit projection mode', async () => {
    const { repo, store } = memoryRepo();
    const report = await onboardNabhold(repo, { ...base, mode: 'apply', projectionMode: 'none' });
    expect(report.blockers[0]).toContain('PROJECTION_MODE_REQUIRED');
    expect(Object.keys(store)).toHaveLength(0);
  });

  it('verify reports missing records as not converged', async () => {
    const { repo } = memoryRepo();
    const report = await onboardNabhold(repo, { ...base, mode: 'verify' });
    expect(report.converged).toBe(false);
  });

  it('reports a wrong-tenant organisation and a duplicate without repairing', async () => {
    const { repo, store } = memoryRepo();
    await onboardNabhold(repo, { ...base, mode: 'apply' });
    store.organisations.push({ ...store.organisations[0], id: 'dup' });
    const report = await onboardNabhold(repo, { ...base, mode: 'apply' });
    expect(report.converged).toBe(false);
    expect(report.blockers.join(' ')).toContain('DUPLICATE');
    expect(store.organisations).toHaveLength(2);
  });

  it('flags a market that exceeds ZA and over-privileged workload identity', async () => {
    const { repo, store } = memoryRepo();
    await onboardNabhold(repo, { ...base, mode: 'apply' });
    store.markets[0].geography = ['ZA', 'UG'];
    const user = store.users.find((u) => u.serviceIdentity === true)!;
    user.platformAdministrator = true;
    user.capabilities = ['content.delivery', 'content.publish'];
    const report = await onboardNabhold(repo, { ...base, mode: 'verify' });
    const text = report.blockers.join(' ');
    expect(text).toContain('exceeds Nabhold');
    expect(text).toContain('platform administrator');
    expect(text).toContain('exceed content delivery');
  });

  it('warns about unapproved bound domains and binds none by default', async () => {
    const { repo, store } = memoryRepo();
    await onboardNabhold(repo, { ...base, mode: 'apply' });
    store['digital-estates'][0].domains = ['nabhold.com'];
    const report = await onboardNabhold(repo, { ...base, mode: 'verify' });
    expect(report.steps.some((s) => s.step === 'digital-estate-domains' && s.action === 'warning')).toBe(true);
    const approved = await onboardNabhold(repo, { ...base, mode: 'verify', approvedDomains: ['nabhold.com'] });
    expect(approved.steps.some((s) => s.step === 'digital-estate-domains')).toBe(false);
  });

  it('creates no human accounts and never reports the secret', async () => {
    const { repo, store } = memoryRepo();
    const report = await onboardNabhold(repo, { ...base, mode: 'apply' });
    expect(store.users).toHaveLength(1);
    expect(store.users[0].serviceIdentity).toBe(true);
    expect(store.users[0].platformAdministrator).toBe(false);
    expect(JSON.stringify(report)).not.toContain('throwaway-secret-value');
    expect(NABHOLD.serviceEmail).toContain('.invalid');
  });

  it('stores no registration, tax or address data in the tenant projection', async () => {
    const { repo, store } = memoryRepo();
    await onboardNabhold(repo, { ...base, mode: 'apply' });
    const text = JSON.stringify(store);
    expect(text).not.toMatch(/\d{4}\/\d{6}\/\d{2}/);
    expect(text).not.toContain('9470182230');
  });
});

describe('Control Plane tenant id', () => {
  it('is never set unless supplied, and warns', async () => {
    const { repo, store } = memoryRepo();
    const report = await onboardNabhold(repo, { ...base, mode: 'apply' });
    expect(store.tenants[0].controlPlaneTenantId).toBeUndefined();
    expect(report.steps.some((s) => s.step === 'tenant-control-plane-id' && s.action === 'warning')).toBe(true);
  });

  it('is set on create, filled when blank, and never overwritten', async () => {
    const { repo, store } = memoryRepo();
    await onboardNabhold(repo, { ...base, mode: 'apply' });
    await onboardNabhold(repo, { ...base, mode: 'apply', controlPlaneTenantId: 'tn_abc123' });
    expect(store.tenants[0].controlPlaneTenantId).toBe('tn_abc123');
    const other = await onboardNabhold(repo, { ...base, mode: 'apply', controlPlaneTenantId: 'tn_other9' });
    expect(other.converged).toBe(false);
    expect(store.tenants[0].controlPlaneTenantId).toBe('tn_abc123');
  });

  it('rejects a malformed value without writing', async () => {
    const { repo, store } = memoryRepo();
    const report = await onboardNabhold(repo, { ...base, mode: 'apply', controlPlaneTenantId: 'nabhold' });
    expect(report.converged).toBe(false);
    expect(report.blockers.join(' ')).toContain('CONTROL_PLANE_TENANT_ID_INVALID');
    expect(Object.keys(store)).toHaveLength(0);
  });
});

describe('Control Plane organisation id', () => {
  it('is never invented, warns when absent, fills a blank once and never overwrites', async () => {
    const { repo, store } = memoryRepo();
    const first = await onboardNabhold(repo, { ...base, mode: 'apply' });
    expect(store.organisations[0].controlPlaneOrganisationId).toBeUndefined();
    expect(first.steps.some((s) => s.step === 'organisation-control-plane-id' && s.action === 'warning')).toBe(true);
    await onboardNabhold(repo, { ...base, mode: 'apply', controlPlaneOrganisationId: '0199a1b2-c3d4-7e8f-9a0b-0000000000a1' });
    expect(store.organisations[0].controlPlaneOrganisationId).toBe('0199a1b2-c3d4-7e8f-9a0b-0000000000a1');
    const other = await onboardNabhold(repo, { ...base, mode: 'apply', controlPlaneOrganisationId: '0199a1b2-c3d4-7e8f-9a0b-0000000000b2' });
    expect(other.converged).toBe(false);
    expect(store.organisations[0].controlPlaneOrganisationId).toBe('0199a1b2-c3d4-7e8f-9a0b-0000000000a1');
  });

  it('is not derived from the legal entity and rejects malformed values', async () => {
    const { repo, store } = memoryRepo();
    await onboardNabhold(repo, { ...base, mode: 'apply' });
    expect(store.organisations[0].controlPlaneOrganisationId).not.toBe('NABHOLD');
    const bad = await onboardNabhold(repo, { ...base, mode: 'apply', controlPlaneOrganisationId: 'x y' });
    expect(bad.blockers.join(' ')).toContain('CONTROL_PLANE_ORGANISATION_ID_INVALID');
  });
});

describe('detectEnvironment', () => {
  it('treats unknown or production as production', () => {
    expect(detectEnvironment({})).toBe('production');
    expect(detectEnvironment({ NODE_ENV: 'production' })).toBe('production');
    expect(detectEnvironment({ BAOBAB_ENVIRONMENT: 'staging' })).toBe('production');
  });
  it('recognises development and test', () => {
    expect(detectEnvironment({ NODE_ENV: 'test' })).toBe('non-production');
    expect(detectEnvironment({ BAOBAB_ENVIRONMENT: 'local' })).toBe('non-production');
  });
});
