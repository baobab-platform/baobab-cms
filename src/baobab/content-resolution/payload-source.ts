import { ContentScope, scopeSpecificity } from '../tenancy/scope.js';
import { publicationStateFromStatus, type ContentEntryRecord, type ContentResolveDependencies } from './contract.js';
import { InheritanceMode, type PublicationState, type ResolutionPolicy } from './types.js';

/**
 * Payload-backed data source for `content.entry.resolve`.
 *
 * Only keys registered here are resolvable; any other key is CONTENT_TYPE_UNKNOWN.
 * Record tenant ids are the Control Plane tenant id (looked up through the
 * tenant projection's `controlPlaneTenantId`), so the handler's tenant check
 * compares like with like. A tenant with no projection yet yields no records.
 *
 * Reads use overrideAccess because the caller is a verified workload, not a
 * Payload user; isolation is enforced by always filtering on the mapped tenant.
 */

export interface PayloadFind {
  find(args: {
    collection: string;
    where: Record<string, unknown>;
    limit: number;
    depth: number;
    overrideAccess: boolean;
  }): Promise<{ docs: Array<Record<string, unknown>> }>;
}

const SCOPES = [
  ContentScope.TENANT,
  ContentScope.LEGAL_ENTITY,
  ContentScope.DIGITAL_ESTATE,
  ContentScope.MARKET,
  ContentScope.LOCALE,
];

const policy = (contentType: string): ResolutionPolicy => ({
  contentType,
  inheritanceMode: InheritanceMode.OVERRIDE,
  supportedScopes: SCOPES,
});

type Source =
  | { collection: 'pages'; policy: ResolutionPolicy }
  | { collection: 'site-configurations'; policy: ResolutionPolicy; kind: string };

export const CONTENT_SOURCES: Record<string, Source> = {
  home: { collection: 'pages', policy: policy('page') },
  navigation: { collection: 'site-configurations', kind: 'navigation', policy: policy('navigation') },
  footer: { collection: 'site-configurations', kind: 'footer', policy: policy('footer') },
  'site-settings': { collection: 'site-configurations', kind: 'site-settings', policy: policy('site-settings') },
  'group-profile': { collection: 'site-configurations', kind: 'group-profile', policy: policy('group-profile') },
};

const str = (value: unknown): string | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'object') {
    const id = (value as { id?: unknown }).id;
    return id === undefined ? undefined : String(id);
  }
  return String(value);
};
const canonical = (value: unknown, field: string): string | undefined =>
  typeof value === 'object' && value !== null ? str((value as Record<string, unknown>)[field]) : undefined;
const iso = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);

/**
 * A record narrows only to the scope it declares (ADR-0012 §26-27). The required
 * `organisation` on a record is the publisher, not necessarily a scope: a
 * DIGITAL_ESTATE record is not limited to a legal entity beyond the one that owns
 * the estate, and a TENANT record is not limited to any. Locale is an explicit
 * resolution field and is declared whenever set.
 */
function declares(scope: unknown, minimum: ContentScope): boolean {
  const s = typeof scope === 'string' && scope in ContentScope ? (scope as ContentScope) : ContentScope.TENANT;
  return scopeSpecificity(s) >= scopeSpecificity(minimum);
}

const strip = (rows: unknown, keys: string[]): Array<Record<string, unknown>> =>
  Array.isArray(rows)
    ? rows.map((row) => Object.fromEntries(keys.map((k) => [k, (row as Record<string, unknown>)[k]])))
    : [];
const cta = (value: unknown): { label: string; href: string } | undefined => {
  const v = value as { label?: unknown; href?: unknown } | null | undefined;
  return v && typeof v.label === 'string' && typeof v.href === 'string' ? { label: v.label, href: v.href } : undefined;
};

/** Drops null and empty values so the estate's optional-string schema accepts the object; returns undefined if nothing remains. */
function cleanObject(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (k === 'id' || v === null || v === undefined || v === '') continue;
    if (typeof v === 'object' && !Array.isArray(v)) {
      const nested = cleanObject(v);
      if (nested) out[k] = nested;
    } else out[k] = v;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/** Field names are the estate's content contract (nabhold page.dto.ts); optional values are omitted, not nulled. */
function dataFor(source: Source, doc: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { title: doc.title };
  const put = (key: string, value: unknown) => {
    if (value !== undefined && value !== null && value !== '') out[key] = value;
  };
  if (source.collection === 'pages') {
    put('slug', doc.slug);
    put('content', doc.content);
    for (const key of ['eyebrow', 'headline', 'introduction', 'institutionalStatement']) put(key, doc[key]);
    put('primaryCta', cta(doc.primaryCta));
    put('secondaryCta', cta(doc.secondaryCta));
    put('seo', cleanObject(doc.seo));
    return out;
  }
  switch (source.kind) {
    case 'navigation':
      out.navigationItems = strip(doc.navigationItems, ['label', 'href']);
      break;
    case 'footer':
      put('statement', doc.statement);
      put('tagline', doc.tagline);
      out.footerLinks = strip(doc.footerLinks, ['label', 'href']);
      break;
    case 'site-settings':
      put('siteName', doc.siteName);
      break;
    default:
      out.body = strip(doc.body, ['type', 'text']);
  }
  put('seo', cleanObject(doc.seo));
  return out;
}

export function createPayloadContentSource(payload: PayloadFind): ContentResolveDependencies {
  return {
    policyFor: (contentKey) => CONTENT_SOURCES[contentKey]?.policy,

    async loadCandidates(controlPlaneTenantId, contentKey): Promise<ContentEntryRecord[]> {
      const source = CONTENT_SOURCES[contentKey];
      if (!source) return [];

      const tenants = await payload.find({
        collection: 'tenants',
        where: { controlPlaneTenantId: { equals: controlPlaneTenantId } },
        limit: 2,
        depth: 0,
        overrideAccess: true,
      });
      // Zero: not projected here. More than one: a corrupt mapping must not guess.
      if (tenants.docs.length !== 1) return [];
      const localTenantId = String(tenants.docs[0].id);

      const and: Record<string, unknown>[] = [{ tenant: { equals: localTenantId } }, { contentKey: { equals: contentKey } }];
      if (source.collection === 'site-configurations') and.push({ kind: { equals: source.kind } });

      const found = await payload.find({
        collection: source.collection,
        where: { and },
        limit: 200,
        depth: 1,
        overrideAccess: true,
      });

      return found.docs.map((doc) => {
        const state: PublicationState =
          source.collection === 'pages'
            ? publicationStateFromStatus(str(doc.status))
            : ((str(doc.publicationState) as PublicationState | undefined) ?? 'DRAFT');
        return {
          id: String(canonical(doc, 'canonicalEntityId') ?? doc.canonicalEntityId ?? doc.id),
          tenantId: controlPlaneTenantId,
          contentKey,
          legalEntityId: declares(doc.contentScope, ContentScope.LEGAL_ENTITY)
            ? canonical(doc.organisation, 'canonicalLegalEntityId')
            : undefined,
          digitalEstateId: declares(doc.contentScope, ContentScope.DIGITAL_ESTATE)
            ? canonical(doc.digitalEstate, 'canonicalDigitalEstateId')
            : undefined,
          marketId: declares(doc.contentScope, ContentScope.MARKET)
            ? canonical(doc.market, 'canonicalMarketId')
            : undefined,
          locale: str(doc.locale),
          publicationState: state,
          effectiveFrom: iso(doc.effectiveFrom),
          effectiveTo: iso(doc.effectiveTo),
          data: dataFor(source, doc),
        };
      });
    },
  };
}
