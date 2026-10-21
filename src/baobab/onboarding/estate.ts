import type { EstateProfile } from './profiles.js';
import { Capability, EditorialRole } from '../authorization/roles.js';

/**
 * Configuration-driven CMS projection onboarding. The Nabhold wrapper retains
 * masterplan G05 restrictions; independent profiles do not inherit its authority.
 *
 * This module is the database-free core of `scripts/onboarding/nabhold.ts`.
 * It decides what the configured CMS projection set must contain, compares
 * it with what exists, and, only when told to, creates what is missing.
 *
 * Authority. The Control Plane owns tenant, legal entity, market, digital
 * estate, entitlement and binding. Everything written here is a LOCAL
 * PROJECTION of those facts, marked as such with provenance and a
 * reconciliation state, and only in a non-production environment with an
 * explicit projection mode. Production writes are refused until the Control
 * Plane can issue the identities; this module never pretends to be that
 * approval.
 *
 * Rules enforced:
 * - convergent and repeatable: lookups by stable key, never duplicate;
 * - never overwrite or repair: a mismatch is reported, not "fixed";
 * - legal-entity references are supplied by their authority, never minted;
 * - market geography and currency come from the independent profile;
 * - no hostname is bound unless explicitly approved;
 * - no human account is created (editors arrive through IAM SSO) and the
 *   only machine identity has delivery-only capability;
 * - no secret appears in a report.
 */

export type Mode = 'dry-run' | 'apply' | 'verify';

export type StepAction = 'create' | 'exists' | 'missing' | 'mismatch' | 'blocked' | 'warning';

export interface StepResult {
  step: string;
  collection: string;
  action: StepAction;
  detail?: string;
}

export interface OnboardingReport {
  mode: Mode;
  environment: 'production' | 'non-production';
  projectionMode: 'local' | 'none';
  steps: StepResult[];
  /** True only when every step is satisfied and nothing is blocked or mismatched. */
  converged: boolean;
  blockers: string[];
  /** Ids of the resolved or created records. Contains no secrets. */
  ids: Record<string, string>;
}

type Doc = Record<string, unknown> & { id: string | number };

/** Persistence seam. The script supplies a Payload-backed implementation; tests supply an in-memory one. */
export interface ProjectionRepository {
  /** Up to `limit` documents whose `field` equals `value`. */
  find(collection: string, field: string, value: string, limit: number): Promise<Doc[]>;
  create(collection: string, data: Record<string, unknown>): Promise<Doc>;
  /** Sets fields on one document. Used only to fill a blank Control Plane tenant id, never to overwrite. */
  update(collection: string, id: string, data: Record<string, unknown>): Promise<Doc>;
}

export interface OnboardingOptions {
  mode: Mode;
  /** `local` is the only supported projection source today; it is development and test only. */
  projectionMode: 'local' | 'none';
  environment: 'production' | 'non-production';
  /** Hostnames approved for binding. Empty by default: domains are routing data and are never invented. */
  approvedDomains?: string[];
  /** The Control Plane tenant id (tn_...), supplied from a Control Plane issuance. Never invented here. */
  controlPlaneTenantId?: string;
  /** The Control Plane PRIMARY Organisation id (ADR-BCP-027). Supplied from a Control Plane issuance; never invented or derived from a legal entity. */
  controlPlaneOrganisationId?: string;
  controlPlaneMarketId?: string;
  controlPlaneDigitalEstateId?: string;
  now?: () => Date;
  /** Supplies a throwaway credential for the machine identity. Never logged or stored by this module. */
  generateSecret: () => string;
}

const asString = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') return String((value as { id?: unknown }).id ?? '');
  return String(value);
};

const sameSet = (a: unknown, b: readonly string[]): boolean =>
  Array.isArray(a) && a.length === b.length && b.every((item) => a.includes(item));

/** Decides production versus not from the process environment. Anything not clearly non-production is production. */
export function detectEnvironment(env: Record<string, string | undefined>): 'production' | 'non-production' {
  const declared = (env.BAOBAB_ENVIRONMENT ?? '').toLowerCase();
  if (declared) {
    return ['development', 'dev', 'test', 'local', 'ci'].includes(declared) ? 'non-production' : 'production';
  }
  const nodeEnv = (env.NODE_ENV ?? '').toLowerCase();
  return nodeEnv === 'development' || nodeEnv === 'test' ? 'non-production' : 'production';
}

export async function onboardEstate(repo: ProjectionRepository, profile: EstateProfile, options: OnboardingOptions): Promise<OnboardingReport> {
  const now = options.now ?? (() => new Date());
  const steps: StepResult[] = [];
  const blockers: string[] = [];
  const ids: Record<string, string> = {};
  const blankReferences: Array<{ collection: string; id: string; data: Record<string, unknown>; step: string }> = [];
  const approvedDomains = options.approvedDomains ?? [];
  const writing = options.mode === 'apply';
  const cpTenantId = options.controlPlaneTenantId;
  const cpOrgId = options.controlPlaneOrganisationId;
  if (cpOrgId !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cpOrgId)) {
    blockers.push('CONTROL_PLANE_ORGANISATION_ID_INVALID: expected a Control Plane Organisation UUID (Shared organisation/v2).');
  }
  if (cpTenantId !== undefined && !/^tn_[a-z0-9]+$/.test(cpTenantId)) {
    blockers.push('CONTROL_PLANE_TENANT_ID_INVALID: expected a Control Plane tenant id such as tn_abc123.');
  }

  for (const value of [options.controlPlaneDigitalEstateId]) {
    if (value !== undefined && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) blockers.push('CONTROL_PLANE_REFERENCE_INVALID');
  }

  if (options.controlPlaneMarketId !== undefined && !/^mkt_[a-z0-9]{1,59}$/.test(options.controlPlaneMarketId)) blockers.push('CONTROL_PLANE_MARKET_ID_INVALID');

  const report = (): OnboardingReport => ({
    mode: options.mode,
    environment: options.environment,
    projectionMode: options.projectionMode,
    steps,
    converged:
      blockers.length === 0 &&
      steps.every((s) => s.action === 'exists' || s.action === 'warning' || (options.mode === 'apply' && s.action === 'create')),
    blockers,
    ids,
  });

  // ---- Preconditions -------------------------------------------------------
  if (writing) {
    if (options.environment === 'production') {
      blockers.push(
        'PRODUCTION_REQUIRES_CONTROL_PLANE: local projections are never written in production. The Control Plane must issue the tenant, legal entity, market and digital estate.',
      );
    }
    if (options.projectionMode !== 'local') {
      blockers.push(
        'PROJECTION_MODE_REQUIRED: no Control Plane source is configured. Pass --projection-mode local to write non-authoritative projections in a development or test environment.',
      );
    }
    if (blockers.length > 0) {
      steps.push({ step: 'preconditions', collection: '-', action: 'blocked', detail: blockers.join(' ') });
      return report();
    }
  }

  // Inspect the complete existing namespace graph before creating even its
  // root. Matching codes are selectors, never proof of tenant ownership. An
  // orphan/wrong-owner child must not cause a new tenant or predecessor write.
  const existing: Record<string, Doc | undefined> = {};
  for (const [collection, code] of [
    ['tenants', profile.tenantCode], ['organisations', profile.organisationCode],
    ['markets', profile.marketCode], ['digital-estates', profile.estateCode],
  ]) {
    const rows = await repo.find(collection, 'code', code, 2);
    if (rows.length > 1) blockers.push('DUPLICATE_NAMESPACE: ' + collection);
    existing[collection] = rows.length === 1 ? rows[0] : undefined;
  }
  for (const collection of ['tenants', 'organisations', 'digital-estates']) {
    if (existing[collection] && existing[collection].status !== 'active') blockers.push('NAMESPACE_DISABLED: ' + collection);
  }
  if (existing.markets && existing.markets.enabled !== true) blockers.push('NAMESPACE_DISABLED: markets');
  const root = existing.tenants;
  for (const collection of ['organisations', 'markets', 'digital-estates']) {
    const child = existing[collection];
    if (child && (!root || asString(child.tenant) !== String(root.id))) blockers.push('NAMESPACE_WRONG_TENANT: ' + collection);
  }
  if (existing.markets && (!existing.organisations || asString(existing.markets.legalEntity) !== String(existing.organisations.id))) {
    blockers.push('NAMESPACE_WRONG_ORGANISATION');
  }
  if (existing['digital-estates'] && (!existing.markets || asString(existing['digital-estates'].defaultMarket) !== String(existing.markets.id))) {
    blockers.push('NAMESPACE_WRONG_MARKET');
  }

  // A CP identifier may project into exactly one local namespace. Check before
  // the first write, including blank-ID fills, rather than relying on SQL's
  // unique constraints or accidentally aliasing an independently governed tenant.
  for (const [collection, field, value, code] of [
    ['tenants', 'controlPlaneTenantId', cpTenantId, profile.tenantCode],
    ['organisations', 'controlPlaneOrganisationId', cpOrgId, profile.organisationCode],
    ['organisations', 'canonicalLegalEntityId', profile.firstPartyId, profile.organisationCode],
    ['markets', 'canonicalMarketId', options.controlPlaneMarketId, profile.marketCode],
    ['digital-estates', 'canonicalDigitalEstateId', options.controlPlaneDigitalEstateId, profile.estateCode],
  ]) {
    if (!value) continue;
    const rows = await repo.find(collection!, field!, value, 2);
    if (rows.length > 1) blockers.push('DUPLICATE_CANONICAL_REFERENCE: ' + collection);
    else if (rows.some(row => row.code !== code)) blockers.push('CANONICAL_REFERENCE_ALREADY_OWNED: ' + collection);
  }
  if (blockers.length) return report();

  const stamp = now().toISOString();
  const provenance = {
    provenance: 'LOCAL_PROJECTION',
    source: 'estate-profile/' + profile.tenantCode,
    authoritative: false,
    reconciliation: { state: 'UNRECONCILED', against: 'baobab-cp' },
  };

  /**
   * Resolves one record by a stable key. Returns the existing document, or creates it
   * when applying. A duplicate is a blocker, never a choice.
   */
  async function ensure(params: {
    step: string;
    collection: string;
    field: string;
    value: string;
    data: () => Record<string, unknown>;
    check: (doc: Doc) => string[];
    idKey: string;
  }): Promise<Doc | undefined> {
    // Never continue writes after an ownership/duplicate mismatch. Verify still
    // inspects the remaining records to give operators a complete report.
    if (writing && blockers.length) return undefined;
    const matches = await repo.find(params.collection, params.field, params.value, 2);

    if (matches.length > 1) {
      const detail = `DUPLICATE: more than one ${params.collection} record has ${params.field} "${params.value}"`;
      steps.push({ step: params.step, collection: params.collection, action: 'mismatch', detail });
      blockers.push(detail);
      return undefined;
    }

    if (matches.length === 1) {
      const doc = matches[0];
      ids[params.idKey] = String(doc.id);
      const problems = params.check(doc);
      if (problems.length > 0) {
        const detail = problems.join('; ');
        steps.push({ step: params.step, collection: params.collection, action: 'mismatch', detail });
        blockers.push(`${params.step}: ${detail}`);
      } else {
        steps.push({ step: params.step, collection: params.collection, action: 'exists' });
      }
      return doc;
    }

    // A canonical reference must not create a second organisation behind an
    // already occupied local code, even in adapters without a unique constraint.
    if (params.collection === 'organisations' && params.field !== 'code') {
      const occupied = await repo.find('organisations', 'code', profile.organisationCode, 2);
      if (occupied.length) {
        blockers.push('DUPLICATE_ORGANISATION_CODE');
        return undefined;
      }
    }

    // Not found.
    if (options.mode === 'verify') {
      steps.push({ step: params.step, collection: params.collection, action: 'missing' });
      blockers.push(`${params.step}: missing`);
      return undefined;
    }
    if (options.mode === 'dry-run') {
      steps.push({ step: params.step, collection: params.collection, action: 'create', detail: 'planned; nothing written' });
      return undefined;
    }

    const created = await repo.create(params.collection, params.data());
    ids[params.idKey] = String(created.id);
    steps.push({ step: params.step, collection: params.collection, action: 'create' });
    return created;
  }

  // ---- 1. Tenant -----------------------------------------------------------
  const tenant = await ensure({
    step: 'tenant',
    collection: 'tenants',
    field: 'code',
    value: profile.tenantCode,
    idKey: 'tenantId',
    data: () => ({
      name: profile.registryName,
      code: profile.tenantCode,
      status: 'active',
      isolationProfile: 'shared-logical',
      defaultLocale: profile.locale,
      supportedLocales: [profile.locale],
      ...(cpTenantId ? { controlPlaneTenantId: cpTenantId } : {}),
      isProjection: true,
      lastSyncedAt: stamp,
      metadata: {
        ...provenance,
        onboardedAt: stamp,
        canonicalReferences: { tenant: cpTenantId ?? 'UNRESOLVED', organisation: cpOrgId ?? 'UNRESOLVED',
          legalEntity: profile.firstPartyId ?? 'UNRESOLVED', market: options.controlPlaneMarketId ?? 'UNRESOLVED', digitalEstate: options.controlPlaneDigitalEstateId ?? 'UNRESOLVED' },
        ...(profile.legalIdentityNote ? { legalIdentity: {
          firstPartyReference: profile.firstPartyId,
          registryName: profile.registryName,
          verification: {
            state: 'CLAIM_RECORDED_VERIFICATION_PENDING',
            note: profile.legalIdentityNote,
          },
        } } : {}),
      },
    }),
    check: (doc) => {
      const problems: string[] = [];
      if (doc.status !== 'active') problems.push(`tenant status is "${String(doc.status)}", expected active`);
      if (cpTenantId && doc.controlPlaneTenantId && doc.controlPlaneTenantId !== cpTenantId) {
        problems.push('controlPlaneTenantId differs from the supplied Control Plane tenant id; it is never overwritten');
      }
      if (options.mode === 'verify' && doc.isProjection === true) {
        const synced = Date.parse(String(doc.lastSyncedAt ?? ''));
        if (Number.isNaN(synced) || now().getTime() - synced > profile.maxProjectionAgeMs) {
          steps.push({
            step: 'tenant-freshness',
            collection: 'tenants',
            action: 'warning',
            detail: 'projection is stale or unsynced; reconcile against the Control Plane',
          });
        }
      }
      return problems;
    },
  });

  if (tenant && cpTenantId && !tenant.controlPlaneTenantId && blockers.length === 0) {
    if (writing) {
      blankReferences.push({ collection: 'tenants', id: String(tenant.id), data: { controlPlaneTenantId: cpTenantId }, step: 'tenant-control-plane-id' });
    } else {
      steps.push({
        step: 'tenant-control-plane-id',
        collection: 'tenants',
        action: options.mode === 'verify' ? 'missing' : 'create',
        detail: options.mode === 'verify' ? 'not set' : 'planned; nothing written',
      });
      if (options.mode === 'verify') blockers.push('tenant-control-plane-id: not set');
    }
  } else if (tenant && !tenant.controlPlaneTenantId) {
    steps.push({
      step: 'tenant-control-plane-id',
      collection: 'tenants',
      action: 'warning',
      detail: 'not set; content resolution refuses every context until the Control Plane issues the tenant id',
    });
  }

  // ---- 2. Organisation (legal-entity projection) ---------------------------
  const tenantId = asString(tenant?.id) ?? '(pending)';
  const organisation = await ensure({
    step: 'organisation',
    collection: 'organisations',
    field: profile.firstPartyId ? 'canonicalLegalEntityId' : 'code',
    value: profile.firstPartyId ?? profile.organisationCode,
    idKey: 'organisationId',
    data: () => ({
      name: profile.registryName,
      code: profile.organisationCode,
      status: 'active',
      tenant: tenantId,
      // The Shared first-party id is the canonical reference. It is supplied, not minted.
      ...(profile.firstPartyId ? { canonicalLegalEntityId: profile.firstPartyId } : {}),
      ...(cpOrgId ? { controlPlaneOrganisationId: cpOrgId } : {}),
    }),
    check: (doc) => {
      const problems: string[] = [];
      if (doc.status !== 'active') problems.push('organisation is not active');
      if (profile.firstPartyId && doc.canonicalLegalEntityId !== profile.firstPartyId) {
        problems.push(`canonicalLegalEntityId is "${String(doc.canonicalLegalEntityId)}", expected ${profile.firstPartyId}`);
      }
      if (tenant && asString(doc.tenant) !== String(tenant.id)) problems.push('organisation belongs to a different tenant');
      if (cpOrgId && doc.controlPlaneOrganisationId && doc.controlPlaneOrganisationId !== cpOrgId) {
        problems.push('controlPlaneOrganisationId differs from the supplied Control Plane organisation id; it is never overwritten');
      }
      return problems;
    },
  });
  if (organisation && cpOrgId && !organisation.controlPlaneOrganisationId && blockers.length === 0) {
    if (writing) {
      blankReferences.push({ collection: 'organisations', id: String(organisation.id), data: { controlPlaneOrganisationId: cpOrgId }, step: 'organisation-control-plane-id' });
    } else {
      steps.push({
        step: 'organisation-control-plane-id',
        collection: 'organisations',
        action: options.mode === 'verify' ? 'missing' : 'create',
        detail: options.mode === 'verify' ? 'not set' : 'planned; nothing written',
      });
      if (options.mode === 'verify') blockers.push('organisation-control-plane-id: not set');
    }
  } else if (organisation && !organisation.controlPlaneOrganisationId) {
    steps.push({
      step: 'organisation-control-plane-id',
      collection: 'organisations',
      action: 'warning',
      detail: 'not set; the primary Organisation cannot be reconciled until the Control Plane issues its id (ADR-BCP-027)',
    });
  }
  // A second organisation reusing the code but not the canonical id would be a forged or duplicate projection.
  const byCode = await repo.find('organisations', 'code', profile.organisationCode, 2);
  if (byCode.length > 0 && !organisation) {
    const detail = `organisation code "${profile.organisationCode}" is already used by a record without canonicalLegalEntityId ${profile.firstPartyId}`;
    steps.push({ step: 'organisation-code', collection: 'organisations', action: 'mismatch', detail });
    blockers.push(detail);
  }

  // ---- 3. Market (South Africa only) --------------------------------------
  const organisationId = asString(organisation?.id) ?? '(pending)';
  const market = await ensure({
    step: 'market',
    collection: 'markets',
    field: 'code',
    value: profile.marketCode,
    idKey: 'marketId',
    data: () => ({
      ...(options.controlPlaneMarketId ? { canonicalMarketId: options.controlPlaneMarketId } : {}),
      name: profile.marketName,
      code: profile.marketCode,
      currency: profile.currency,
      geography: [...profile.geography],
      brand: profile.registryName,
      supportedLocales: [profile.locale],
      enabled: true,
      tenant: tenantId,
      legalEntity: organisationId,
    }),
    check: (doc) => {
      const problems: string[] = [];
      if (doc.enabled !== true) problems.push('market is not enabled');
      if (options.controlPlaneMarketId && doc.canonicalMarketId !== options.controlPlaneMarketId) problems.push('market CP reference differs or is unresolved');
      if (!sameSet(doc.geography, profile.geography)) {
        problems.push(`geography ${JSON.stringify(doc.geography)} exceeds ${profile.registryName}'s configured market`);
      }
      if (tenant && asString(doc.tenant) !== String(tenant.id)) problems.push('market belongs to a different tenant');
      if (organisation && asString(doc.legalEntity) !== String(organisation.id)) problems.push('market belongs to a different organisation');
      if (doc.currency !== profile.currency) problems.push(`currency is "${String(doc.currency)}", expected ${profile.currency}`);
      return problems;
    },
  });

  // ---- 4. Digital estate ---------------------------------------------------
  const marketId = asString(market?.id) ?? '(pending)';
  await ensure({
    step: 'digital-estate',
    collection: 'digital-estates',
    field: 'code',
    value: profile.estateCode,
    idKey: 'digitalEstateId',
    data: () => ({
      ...(options.controlPlaneDigitalEstateId ? { canonicalDigitalEstateId: options.controlPlaneDigitalEstateId } : {}),
      name: profile.estateName,
      code: profile.estateCode,
      // Routing data only, never identity. Empty unless explicitly approved.
      domains: [...approvedDomains],
      defaultLocale: profile.locale,
      defaultMarket: marketId,
      status: 'active',
      tenant: tenantId,
    }),
    check: (doc) => {
      const problems: string[] = [];
      if (tenant && asString(doc.tenant) !== String(tenant.id)) problems.push('estate belongs to a different tenant');
      if (doc.status !== 'active') problems.push('estate is not active');
      if (options.controlPlaneDigitalEstateId && doc.canonicalDigitalEstateId !== options.controlPlaneDigitalEstateId) problems.push('estate CP reference differs or is unresolved');
      if (market && asString(doc.defaultMarket) !== String(market.id)) problems.push('defaultMarket is not the configured market');
      const bound = Array.isArray(doc.domains) ? (doc.domains as unknown[]).map(String) : [];
      const unapproved = bound.filter((domain) => !approvedDomains.includes(domain));
      if (unapproved.length > 0) {
        steps.push({
          step: 'digital-estate-domains',
          collection: 'digital-estates',
          action: 'warning',
          detail: `domains not in the approved list: ${unapproved.join(', ')}`,
        });
      }
      return problems;
    },
  });

  // ---- 5. Editorial workforce ---------------------------------------------
  steps.push({
    step: 'editorial-identities',
    collection: 'users',
    action: 'warning',
    detail:
      'Not created here. Human editors arrive through IAM single sign-on with scoped grants. Production editorial authentication stays blocked until IAM federation is proven end to end.',
  });

  // ---- 6. Workload identity (least privilege, delivery only) --------------
  if (profile.serviceEmail) await ensure({
    step: 'workload-identity',
    collection: 'users',
    field: 'email',
    value: profile.serviceEmail!,
    idKey: 'workloadUserId',
    data: () => ({
      email: profile.serviceEmail,
      // Unusable by design: the machine identity authenticates with an API key or workload token,
      // never this password. It is not printed, logged or stored anywhere else.
      password: options.generateSecret(),
      tenantId,
      legalEntityId: organisationId,
      digitalEstateIds: [asString(ids.digitalEstateId) ?? '(pending)'],
      marketIds: [marketId],
      locales: [profile.locale],
      editorialRoles: [EditorialRole.VIEWER],
      capabilities: [Capability.CONTENT_DELIVERY],
      platformAdministrator: false,
      serviceIdentity: true,
      tenantID: tenantId,
      organisationID: organisationId,
      roles: ['viewer'],
    }),
    check: (doc) => {
      const problems: string[] = [];
      if (doc.platformAdministrator === true) problems.push('workload identity is a platform administrator');
      if (doc.serviceIdentity !== true) problems.push('workload identity is not marked as a service identity');
      if (!sameSet(doc.capabilities, [Capability.CONTENT_DELIVERY])) {
        problems.push(`capabilities ${JSON.stringify(doc.capabilities)} exceed content delivery`);
      }
      if (!sameSet(doc.editorialRoles, [EditorialRole.VIEWER])) problems.push('editorial roles exceed VIEWER');
      if (tenant && asString(doc.tenantId) !== String(tenant.id)) problems.push('workload identity is bound to a different tenant');
      return problems;
    },
  });

  // A blank reference is a mutation too. Defer it until every existing
  // descendant/workload check has passed; a non-converged graph receives no fill.
  if (blockers.length === 0) for (const pending of blankReferences) {
    await repo.update(pending.collection, pending.id, pending.data);
    steps.push({ step: pending.step, collection: pending.collection, action: 'create', detail: 'filled a blank value' });
  }

  return report();
}
