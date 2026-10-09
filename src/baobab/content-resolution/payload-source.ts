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

function dataFor(source: Source, doc: Record<string, unknown>): Record<string, unknown> {
  if (source.collection === 'pages') return { title: doc.title, slug: doc.slug, content: doc.content ?? null };
  switch (source.kind) {
    case 'navigation':
      return { title: doc.title, items: doc.navigation ?? [] };
    case 'footer':
      return { title: doc.title, ...((doc.footer as object) ?? {}) };
    case 'site-settings':
      return { title: doc.title, ...((doc.settings as object) ?? {}) };
    default:
      return { title: doc.title, ...((doc.profile as object) ?? {}) };
  }
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
