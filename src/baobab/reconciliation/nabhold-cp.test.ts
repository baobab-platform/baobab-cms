import { describe, expect, it, vi } from 'vitest';
import { buildReconciliationReport, renderText, type CmsSnapshot, type ControlPlaneObservation, type UpstreamItem } from './nabhold-cp.js';
import { observeControlPlaneTenant } from './control-plane-reader.js';

const upstream: UpstreamItem[] = [
  { id: 'a', title: 'done thing', status: 'DONE', asOf: '2026-10-09', evidence: 'PR 1' },
  { id: 'b', title: 'open thing', status: 'OPEN', asOf: '2026-10-09' },
  { id: 'c', title: 'unknown thing', status: 'UNKNOWN', asOf: '2026-10-09' },
];
const KEYS = ['home', 'navigation', 'footer', 'site-settings', 'group-profile'];
const snap = (over: Partial<CmsSnapshot> = {}): CmsSnapshot => ({
  tenant: { id: 't', isProjection: true, status: 'active' },
  organisation: { id: 'o', canonicalLegalEntityId: 'NABHOLD' },
  markets: [{ code: 'nabhold_za', geography: ['ZA'], currency: 'ZAR' }],
  estates: [{ code: 'nabhold-corporate', domains: [] }],
  content: KEYS.map((key) => ({ key, state: 'DRAFT' })),
  workloadIdentities: [{ serviceIdentity: true, platformAdministrator: false, capabilities: ['content.delivery'] }],
  humanEditorCount: 0,
  outbox: { PENDING: 0, FAILED_TERMINAL: 0, PUBLISHED: 9 },
  routeConfigPresent: {},
  providerSupport: { capability: 'content.entry.resolve', implementationStatus: 'PARTIAL' },
  ...over,
});
const notTried: ControlPlaneObservation = { status: 'not_attempted', reason: 'none' };
const run = (s: CmsSnapshot, cp: ControlPlaneObservation = notTried) => buildReconciliationReport({ snapshot: s, controlPlane: cp, upstream });
const get = (r: ReturnType<typeof run>, id: string) => r.findings.find((x) => x.id === id)!;

describe('reconciliation report', () => {
  it('never reports activation and does not turn missing information into success', () => {
    const r = run(snap());
    expect(r.activationObserved).toBe(false);
    expect(get(r, 'capability-binding').standing).toBe('UNVERIFIED');
    expect(get(r, 'legal-person-evidence').standing).toBe('UNVERIFIED');
    expect(get(r, 'cp-tenant-id').standing).toBe('BLOCKED');
    expect(renderText(r)).toContain('Activation observed: no');
  });

  it('keeps the PRIMARY Organisation separate from the legal entity (ADR-BCP-027)', () => {
    const r = run(snap());
    const org = get(r, 'primary-organisation');
    expect(org.standing).toBe('BLOCKED');
    expect(org.detail).toContain('never used to infer the PRIMARY Organisation');
    expect(get(r, 'legal-actor').standing).toBe('DECLARED');
    expect(get(r, 'legal-actor').detail).toContain('not an operating mandate');
  });

  it('cannot confirm the PRIMARY Organisation while the read model does not carry it', () => {
    const r = run(snap({ organisation: { controlPlaneOrganisationId: '0199a1b2-c3d4-7e8f-9a0b-0000000000a1', canonicalLegalEntityId: 'NABHOLD' } }));
    expect(get(r, 'primary-organisation').standing).toBe('UNVERIFIED');
    expect(get(r, 'primary-organisation').detail).toContain('LA-01');
  });

  it('confirms or contradicts a Control Plane answer', () => {
    const s = snap({ tenant: { controlPlaneTenantId: 'tn_a1', isProjection: true, status: 'active' }, organisation: { controlPlaneOrganisationId: '0199a1b2-c3d4-7e8f-9a0b-0000000000a1' } });
    const active = run(s, { status: 'found', tenant: { tenantId: 'tn_a1', observedState: 'active', organisationId: '0199a1b2-c3d4-7e8f-9a0b-0000000000a1' } });
    expect(get(active, 'cp-tenant-id').standing).toBe('EVIDENCED');
    expect(get(active, 'primary-organisation').standing).toBe('EVIDENCED');
    expect(active.activationObserved).toBe(false); // a tenant is not a capability binding
    expect(get(run(s, { status: 'found', tenant: { tenantId: 'tn_a1', observedState: 'provisioning' } }), 'cp-tenant-id').standing).toBe('BLOCKED');
    expect(get(run(s, { status: 'found', tenant: { tenantId: 'tn_zz', observedState: 'active' } }), 'cp-tenant-id').standing).toBe('BLOCKED');
    expect(get(run(s, { status: 'found', tenant: { tenantId: 'tn_a1', observedState: 'active', organisationId: '0199a1b2-c3d4-7e8f-9a0b-0000000000c3' } }), 'primary-organisation').standing).toBe('BLOCKED');
    expect(get(run(s, { status: 'not_found' }), 'cp-tenant-id').standing).toBe('BLOCKED');
    expect(get(run(s, { status: 'unavailable', reason: 'down' }), 'cp-tenant-id').standing).toBe('UNVERIFIED');
  });

  it('flags a legal-entity compatibility projection that disagrees', () => {
    const s = snap({ tenant: { controlPlaneTenantId: 'tn_a1', status: 'active' } });
    const r = run(s, { status: 'found', tenant: { tenantId: 'tn_a1', observedState: 'active', legalEntityId: 'OTHER' } });
    expect(get(r, 'legal-actor').standing).toBe('BLOCKED');
  });

  it('flags a market wider than ZA, missing content and dead letters', () => {
    const r = run(snap({ markets: [{ code: 'm', geography: ['ZA', 'UG'], currency: 'ZAR' }], content: [], outbox: { FAILED_TERMINAL: 2 } }));
    expect(get(r, 'market-projection').standing).toBe('BLOCKED');
    expect(get(r, 'content-records').standing).toBe('BLOCKED');
    expect(get(r, 'outbox').standing).toBe('BLOCKED');
  });

  it('reports route configuration by name only, never values', () => {
    const r = run(snap({ routeConfigPresent: { CMS_TOKEN_ISSUER: true } }));
    const f = get(r, 'route-configuration');
    expect(f.standing).toBe('BLOCKED');
    expect(f.detail).toContain('CMS_TOKEN_AUDIENCE');
    expect(f.detail).not.toContain('CMS_TOKEN_ISSUER,');
  });

  it('flags over-privileged service identities and treats editor sign-in as blocked', () => {
    const r = run(snap({ workloadIdentities: [{ serviceIdentity: true, platformAdministrator: true, capabilities: ['content.delivery'] }], humanEditorCount: 2 }));
    expect(get(r, 'workload-identity').standing).toBe('BLOCKED');
    expect(get(r, 'editorial-access').standing).toBe('BLOCKED');
  });

  it('maps upstream facts to standings and counts everything', () => {
    const r = run(snap());
    expect(get(r, 'upstream-a').standing).toBe('EVIDENCED');
    expect(get(r, 'upstream-b').standing).toBe('BLOCKED');
    expect(get(r, 'upstream-c').standing).toBe('UNVERIFIED');
    expect(Object.values(r.summary).reduce((a, b) => a + b, 0)).toBe(r.findings.length);
  });

  it('reports missing projections as blocked', () => {
    const r = run(snap({ tenant: undefined, organisation: undefined, markets: [] }));
    expect(get(r, 'tenant-projection').standing).toBe('BLOCKED');
    expect(get(r, 'primary-organisation').standing).toBe('BLOCKED');
    expect(get(r, 'market-projection').standing).toBe('BLOCKED');
  });

  it('shows domains as planned when none are bound and unverified when some are', () => {
    expect(get(run(snap()), 'estate-domains').standing).toBe('PLANNED');
    expect(get(run(snap({ estates: [{ domains: ['nabhold.com'] }] })), 'estate-domains').standing).toBe('UNVERIFIED');
  });
});

describe('Control Plane tenant reader', () => {
  const ok = (body: unknown, status = 200) => vi.fn(async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  const base = { baseUrl: 'https://cp.example/', token: 'read-token-0123456789', tenantId: 'tn_a1' };

  it('does not call out without configuration, an id, or with a malformed id', async () => {
    const f = ok({});
    expect((await observeControlPlaneTenant({ ...base, token: undefined, fetchImpl: f })).status).toBe('not_attempted');
    expect((await observeControlPlaneTenant({ ...base, tenantId: undefined, fetchImpl: f })).status).toBe('not_attempted');
    expect((await observeControlPlaneTenant({ ...base, tenantId: '../x', fetchImpl: f })).status).toBe('not_attempted');
    expect(f).not.toHaveBeenCalled();
  });

  it('maps answers and failures', async () => {
    const found = await observeControlPlaneTenant({ ...base, fetchImpl: ok({ tenant_id: 'tn_a1', observed_state: 'active', legal_entity_id: 'NABHOLD' }) });
    expect(found).toEqual({ status: 'found', tenant: { tenantId: 'tn_a1', desiredState: undefined, observedState: 'active', legalEntityId: 'NABHOLD', organisationId: undefined } });
    expect((await observeControlPlaneTenant({ ...base, fetchImpl: ok({}, 404) })).status).toBe('not_found');
    for (const s of [401, 403, 500]) expect((await observeControlPlaneTenant({ ...base, fetchImpl: ok({}, s) })).status).toBe('unavailable');
    expect((await observeControlPlaneTenant({ ...base, fetchImpl: ok({ nope: 1 }) })).status).toBe('unavailable');
    const down = (async () => { throw new Error('secret read-token-0123456789'); }) as unknown as typeof fetch;
    const r = await observeControlPlaneTenant({ ...base, fetchImpl: down });
    expect(JSON.stringify(r)).not.toContain('read-token');
  });
});
