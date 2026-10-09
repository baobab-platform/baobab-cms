/**
 * Control Plane reconciliation report for the Nabhold corporate estate (CMS-NAB-08).
 *
 * The report states what the CMS can show and what it cannot. It never reports
 * an activation it has not observed and never turns "no information" into
 * "fine". Each finding carries one standing:
 *
 *   EVIDENCED   observed directly: a local fact, or a Control Plane answer received now
 *   DECLARED    stated by a record the CMS holds, not confirmed by the authority
 *   PLANNED     intended, with no implementation or approval in place yet
 *   UNVERIFIED  the means to check were unavailable or do not exist yet
 *   BLOCKED     something known prevents progress
 *
 * Shaped by ADR-BCP-026 and ADR-BCP-027 (both treated as accepted by sponsor
 * instruction on 2026-10-09; the documents themselves still read Proposed):
 * a tenant's identity is its PRIMARY Organisation, which is never derived from a
 * legal entity; the legal entity is optional and per operation; evidence
 * standing, admission, entitlement, binding and provider readiness are
 * separate; a first-party registry entry is not proof of incorporation.
 */

export type Standing = 'EVIDENCED' | 'DECLARED' | 'PLANNED' | 'UNVERIFIED' | 'BLOCKED';

export interface Finding {
  id: string;
  area: 'identity' | 'legal' | 'estate' | 'capability' | 'content' | 'operations' | 'upstream';
  title: string;
  standing: Standing;
  detail: string;
  nextStep?: string;
}

export interface UpstreamItem {
  id: string;
  title: string;
  status: 'DONE' | 'OPEN' | 'BLOCKED' | 'UNKNOWN';
  evidence?: string;
  asOf: string;
  nextStep?: string;
}

type Row = Record<string, unknown>;

export interface CmsSnapshot {
  tenant?: Row;
  organisation?: Row;
  markets: Row[];
  estates: Row[];
  /** Content records by key with their publication state (pages use status; site-configurations use publicationState). */
  content: Array<{ key: string; state: string }>;
  workloadIdentities: Row[];
  humanEditorCount: number;
  outbox: Record<string, number>;
  /** Names only, never values. */
  routeConfigPresent: Record<string, boolean>;
  providerSupport?: { capability: string; implementationStatus: string } | null;
}

export interface ControlPlaneTenantView {
  tenantId: string;
  desiredState?: string;
  observedState?: string;
  legalEntityId?: string;
  /** Not yet in the Shared tenant read model (ADR-BCP-027 LA-01); compared only if a Control Plane returns it. */
  organisationId?: string;
}

export type ControlPlaneObservation =
  | { status: 'found'; tenant: ControlPlaneTenantView }
  | { status: 'not_found' }
  | { status: 'unavailable'; reason: string }
  | { status: 'not_attempted'; reason: string };

export const REQUIRED_CONTENT_KEYS = ['home', 'navigation', 'footer', 'site-settings', 'group-profile'] as const;
export const REQUIRED_ROUTE_CONFIG = [
  'CMS_TOKEN_ISSUER',
  'CMS_TOKEN_AUDIENCE',
  'CMS_TOKEN_JWKS_URL',
  'CONTROL_PLANE_URL',
  'CMS_CONTEXT_VALIDATOR_TOKEN',
] as const;

const str = (v: unknown): string | undefined => (typeof v === 'string' && v.length > 0 ? v : undefined);

export interface ReconciliationReport {
  generatedAt: string;
  scope: string;
  /**
   * Always false. Activation means an ACTIVE Control Plane capability binding, which this report cannot observe.
   * It will not become true until a binding read exists and is exercised; a confirmed tenant is not an activation.
   */
  activationObserved: false;
  summary: Record<Standing, number>;
  findings: Finding[];
  upstream: UpstreamItem[];
}

export function buildReconciliationReport(input: {
  snapshot: CmsSnapshot;
  controlPlane: ControlPlaneObservation;
  upstream: UpstreamItem[];
  now?: Date;
}): ReconciliationReport {
  const { snapshot: s, controlPlane: cp } = input;
  const f: Finding[] = [];
  const add = (x: Finding) => f.push(x);

  // ---- Tenant projection and its Control Plane id -------------------------
  const cpTenantId = str(s.tenant?.controlPlaneTenantId);
  if (!s.tenant) {
    add({ id: 'tenant-projection', area: 'identity', title: 'CMS tenant projection', standing: 'BLOCKED', detail: 'No Nabhold tenant projection exists in the CMS.', nextStep: 'Run scripts/onboarding/nabhold.ts in a non-production environment.' });
  } else {
    add({ id: 'tenant-projection', area: 'identity', title: 'CMS tenant projection', standing: 'EVIDENCED', detail: `A local projection exists (isProjection=${String(s.tenant.isProjection)}, status=${String(s.tenant.status)}). It is not authoritative.` });
  }

  if (s.tenant && !cpTenantId) {
    add({ id: 'cp-tenant-id', area: 'identity', title: 'Control Plane tenant id', standing: 'BLOCKED', detail: 'The projection holds no Control Plane tenant id, so content resolution refuses every context for this estate.', nextStep: 'Obtain the tenant id from a Control Plane issuance after admission and provisioning; never invent it.' });
  } else if (s.tenant && cpTenantId) {
    if (cp.status === 'found') {
      const state = cp.tenant.observedState ?? cp.tenant.desiredState ?? 'unknown';
      if (cp.tenant.tenantId !== cpTenantId) {
        add({ id: 'cp-tenant-id', area: 'identity', title: 'Control Plane tenant id', standing: 'BLOCKED', detail: 'The Control Plane answered with a different tenant id than the projection holds.' });
      } else if (state === 'active') {
        add({ id: 'cp-tenant-id', area: 'identity', title: 'Control Plane tenant id', standing: 'EVIDENCED', detail: `The Control Plane reports the tenant observed state "${state}".` });
      } else {
        add({ id: 'cp-tenant-id', area: 'identity', title: 'Control Plane tenant id', standing: 'BLOCKED', detail: `The Control Plane reports the tenant in state "${state}", not active.` });
      }
    } else if (cp.status === 'not_found') {
      add({ id: 'cp-tenant-id', area: 'identity', title: 'Control Plane tenant id', standing: 'BLOCKED', detail: 'The Control Plane has no tenant with the id the projection holds.', nextStep: 'Correct the projection from a real issuance; do not edit the Control Plane to match.' });
    } else {
      add({ id: 'cp-tenant-id', area: 'identity', title: 'Control Plane tenant id', standing: 'UNVERIFIED', detail: `The projection holds an id, but it could not be confirmed (${cp.reason}).` });
    }
  }

  // ---- PRIMARY Organisation (ADR-BCP-027) -----------------------------------
  const cpOrgId = str(s.organisation?.controlPlaneOrganisationId);
  const legalRef = str(s.organisation?.canonicalLegalEntityId);
  if (!s.organisation) {
    add({ id: 'primary-organisation', area: 'identity', title: 'PRIMARY Organisation', standing: 'BLOCKED', detail: 'No organisation projection exists for the tenant.' });
  } else if (!cpOrgId) {
    add({ id: 'primary-organisation', area: 'identity', title: 'PRIMARY Organisation', standing: 'BLOCKED', detail: `The projection holds no Control Plane organisation id.${legalRef ? ` It does hold a legal-entity reference (${legalRef}); that is a legal-actor reference and is never used to infer the PRIMARY Organisation.` : ''}`, nextStep: 'Fill from the Control Plane issuance of the Nabhold Organisation.' });
  } else if (cp.status === 'found' && cp.tenant.organisationId) {
    const same = cp.tenant.organisationId === cpOrgId;
    add({ id: 'primary-organisation', area: 'identity', title: 'PRIMARY Organisation', standing: same ? 'EVIDENCED' : 'BLOCKED', detail: same ? 'The Control Plane reports the same PRIMARY Organisation.' : 'The Control Plane reports a different PRIMARY Organisation than the projection holds.' });
  } else {
    add({ id: 'primary-organisation', area: 'identity', title: 'PRIMARY Organisation', standing: 'UNVERIFIED', detail: 'The projection holds a Control Plane organisation id, but the Shared tenant read model does not yet expose the PRIMARY Organisation (ADR-BCP-027 LA-01), so it cannot be confirmed.', nextStep: 'Shared amendment exposing organisation_id on the tenant read model.' });
  }

  // ---- Legal actor and legal-person evidence --------------------------------
  if (s.organisation) {
    let detail = legalRef
      ? `The organisation carries the first-party legal-entity reference ${legalRef}. It is optional, applies per operation and is not an operating mandate. Content drafting and resolution need no legal actor.`
      : 'No legal-entity reference is held. Not required for content drafting or resolution.';
    let standing: Standing = legalRef ? 'DECLARED' : 'PLANNED';
    if (cp.status === 'found' && cp.tenant.legalEntityId && legalRef && cp.tenant.legalEntityId !== legalRef) {
      standing = 'BLOCKED';
      detail += ` The Control Plane compatibility projection names ${cp.tenant.legalEntityId}, which differs.`;
    }
    add({ id: 'legal-actor', area: 'legal', title: 'Legal-actor reference', standing, detail });
  }
  add({
    id: 'legal-person-evidence',
    area: 'legal',
    title: 'Legal-person verification',
    standing: 'UNVERIFIED',
    detail: 'The CMS stores no registration, tax or address facts and is not a legal registry. A registry entry or a recorded certificate is a claim with an evidence pointer; no Control Plane verification case was observed.',
    nextStep: 'A Control Plane verification case against approved source evidence.',
  });

  // ---- Market and estate -----------------------------------------------------
  const marketProblems: string[] = [];
  for (const m of s.markets) {
    const geo = Array.isArray(m.geography) ? (m.geography as unknown[]).map(String) : [];
    if (geo.length !== 1 || geo[0] !== 'ZA') marketProblems.push(`market ${String(m.code)} covers ${JSON.stringify(geo)}`);
    if (m.currency !== 'ZAR') marketProblems.push(`market ${String(m.code)} currency is ${String(m.currency)}`);
  }
  if (s.markets.length === 0) {
    add({ id: 'market-projection', area: 'estate', title: 'Market projection', standing: 'BLOCKED', detail: 'No market projection exists.' });
  } else {
    add({ id: 'market-projection', area: 'estate', title: 'Market projection', standing: marketProblems.length ? 'BLOCKED' : 'DECLARED', detail: marketProblems.length ? marketProblems.join('; ') : 'South Africa only (ZA, ZAR). Local projection, not reconciled with the Control Plane.' });
  }
  const boundDomains = s.estates.flatMap((e) => (Array.isArray(e.domains) ? (e.domains as unknown[]).map(String) : []));
  add({
    id: 'estate-domains',
    area: 'estate',
    title: 'Digital-estate domains',
    standing: boundDomains.length === 0 ? 'PLANNED' : 'UNVERIFIED',
    detail: boundDomains.length === 0 ? 'No hostname is bound to the estate in the CMS.' : `Bound: ${boundDomains.join(', ')}. Whether the Control Plane approved these bindings cannot be checked here.`,
  });

  // ---- Capability ----------------------------------------------------------
  add({
    id: 'provider-declaration',
    area: 'capability',
    title: 'content.entry.resolve provider declaration',
    standing: s.providerSupport ? 'DECLARED' : 'PLANNED',
    detail: s.providerSupport
      ? `Declared ${s.providerSupport.implementationStatus} support for ${s.providerSupport.capability}. A declaration is repository evidence only, not certification, binding, grant or health.`
      : 'No provider support is declared.',
  });
  add({
    id: 'capability-binding',
    area: 'capability',
    title: 'Control Plane capability binding',
    standing: 'UNVERIFIED',
    detail: 'No ACTIVE binding for content.entry.resolve has been observed for this tenant. The CMS cannot create or assert one.',
    nextStep: 'Control Plane resolution for the Nabhold tenant after provisioning, entitlement and grant.',
  });
  const missingConfig = REQUIRED_ROUTE_CONFIG.filter((k) => !s.routeConfigPresent[k]);
  add({
    id: 'route-configuration',
    area: 'capability',
    title: 'Resolve route configuration',
    standing: missingConfig.length ? 'BLOCKED' : 'EVIDENCED',
    detail: missingConfig.length ? `Not configured, so the route refuses every call: ${missingConfig.join(', ')}.` : 'All route settings are present (values are not shown).',
  });

  // ---- Content -----------------------------------------------------------------
  const missingKeys = REQUIRED_CONTENT_KEYS.filter((k) => !s.content.some((c) => c.key === k));
  const published = s.content.filter((c) => ['PUBLISHED', 'published'].includes(c.state));
  add({
    id: 'content-records',
    area: 'content',
    title: 'Corporate singleton content',
    standing: missingKeys.length ? 'BLOCKED' : 'EVIDENCED',
    detail: missingKeys.length
      ? `Missing: ${missingKeys.join(', ')}.`
      : `${s.content.length} records present; ${published.length} published, ${s.content.length - published.length} not published. Public resolution returns only published records.`,
    nextStep: missingKeys.length ? 'scripts/onboarding/nabhold-content.ts' : undefined,
  });

  // ---- Operations ----------------------------------------------------------------
  const dead = s.outbox.FAILED_TERMINAL ?? 0;
  add({
    id: 'outbox',
    area: 'operations',
    title: 'Revalidation outbox',
    standing: dead > 0 ? 'BLOCKED' : 'EVIDENCED',
    detail: `pending ${s.outbox.PENDING ?? 0}, retrying ${s.outbox.FAILED_RETRYABLE ?? 0}, dead-lettered ${dead}, delivered ${s.outbox.PUBLISHED ?? 0}.`,
    nextStep: dead > 0 ? 'Fix the cause, then scripts/outbox/dispatch-nabhold.ts --requeue-terminal.' : undefined,
  });
  const overPrivileged = s.workloadIdentities.filter(
    (u) => u.platformAdministrator === true || (Array.isArray(u.capabilities) && (u.capabilities as unknown[]).some((c) => c !== 'content.delivery')),
  );
  add({
    id: 'workload-identity',
    area: 'operations',
    title: 'Workload identities',
    standing: overPrivileged.length ? 'BLOCKED' : s.workloadIdentities.length ? 'EVIDENCED' : 'PLANNED',
    detail: overPrivileged.length ? `${overPrivileged.length} service identity exceeds delivery-only privilege.` : `${s.workloadIdentities.length} service identities, all delivery-only.`,
  });
  add({
    id: 'editorial-access',
    area: 'operations',
    title: 'Editorial sign-in',
    standing: 'BLOCKED',
    detail: `${s.humanEditorCount} human editor accounts exist locally. Production sign-in depends on IAM federation, which is not proven end to end.`,
  });

  // ---- Upstream dependencies ---------------------------------------------------------
  const upstreamFindings: Finding[] = input.upstream.map((u) => ({
    id: `upstream-${u.id}`,
    area: 'upstream',
    title: u.title,
    standing: u.status === 'DONE' ? 'EVIDENCED' : u.status === 'UNKNOWN' ? 'UNVERIFIED' : 'BLOCKED',
    detail: `${u.status} as of ${u.asOf}${u.evidence ? ` (${u.evidence})` : ''}. This is a recorded fact, not re-observed by this report.`,
    nextStep: u.nextStep,
  }));
  f.push(...upstreamFindings);

  const summary: Record<Standing, number> = { EVIDENCED: 0, DECLARED: 0, PLANNED: 0, UNVERIFIED: 0, BLOCKED: 0 };
  for (const x of f) summary[x.standing] += 1;

  return {
    generatedAt: (input.now ?? new Date()).toISOString(),
    scope: 'Nabhold corporate digital estate, CMS projection',
    activationObserved: false,
    summary,
    findings: f,
    upstream: input.upstream,
  };
}

export function renderText(report: ReconciliationReport): string {
  const lines = [`Nabhold CMS reconciliation, ${report.generatedAt}`, `Activation observed: no (this report cannot observe a capability binding)`];
  lines.push(Object.entries(report.summary).map(([k, v]) => `${k} ${v}`).join('  '), '');
  for (const x of report.findings) {
    lines.push(`[${x.standing}] ${x.title}`, `    ${x.detail}`);
    if (x.nextStep) lines.push(`    next: ${x.nextStep}`);
  }
  return lines.join('\n');
}
