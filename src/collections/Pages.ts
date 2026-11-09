import type { CollectionConfig, TextFieldSingleValidation } from 'payload';
import { validateLinkTarget } from './SiteConfigurations.js';
import { tenantOwnedField, contentScopeField, sameTenantRelationshipField } from '../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../baobab/tenancy/access.js';
import { canonicalIdField } from '../baobab/identity/field.js';
import { canonicalAfterChangeHook, canonicalAfterDeleteHook } from '../baobab/events/hook.js';
import { CanonicalEventType } from '../baobab/events/types.js';
import { asPageState, createPublicationGuard } from '../baobab/authorization/publication.js';
import { tryResolveContext } from '../baobab/context/resolve.js';

/** Publishing always requires explicit editorial authority, including legacy users.
 * Do not infer a role from an existing account or content.management alone. */
const pageGuard = createPublicationGuard({ stateField: 'status', readState: asPageState });

type PageStatus = 'draft' | 'published' | 'archived';

/** ADR-0012 §65-66, CT-006: scoped slugs are checked in the canonical tenant.
 * Tenant assignment runs after field validation on create. Never trust the
 * client's siblingData. Read omitted update scope from the persisted record.
 * Request validation is defence in depth; a PG17 unique index must also
 * enforce concurrent writes (see audit ledger).
 */
export const validateScopedSlug: TextFieldSingleValidation = async (value, options) => {
  const { req, siblingData, id } = options;
  if (typeof value !== 'string' || !value.trim()) return 'Slug is required';

  const context = tryResolveContext(req);
  if (!context) return 'Cannot verify page slug without an authorised context';
  const data = (siblingData ?? {}) as Record<string, unknown>;
  const has = (key: string) => Object.prototype.hasOwnProperty.call(data, key);
  const rel = (v: unknown): string | undefined => {
    if (typeof v === 'object' && v !== null) {
      const idValue = (v as { id?: unknown }).id;
      return idValue === undefined || idValue === null ? undefined : String(idValue);
    }
    return v === undefined || v === null || v === '' ? undefined : String(v);
  };

  // On a partial update the validator cannot treat absent dimensions as
  // global/unscoped: the caller may only be editing the slug.
  const prior = id && (!has('tenant') || !has('digitalEstate') || !has('locale'))
    ? (await req.payload.findByID({
        collection: 'pages', id, depth: 0, overrideAccess: true, req,
      })) as unknown as Record<string, unknown> | null
    : null;
  if (id && (!has('tenant') || !has('digitalEstate') || !has('locale')) && !prior) {
    return 'Cannot verify scope for missing page record';
  }

  const tenantId = context.kind === 'tenant'
    ? context.tenantId
    : rel(has('tenant') ? data.tenant : prior?.tenant);
  if (!tenantId) return 'Cannot verify page slug without a canonical tenant';
  if (prior && context.kind === 'tenant' && rel(prior.tenant) !== context.tenantId) {
    return 'Page does not belong to the authorised tenant';
  }

  const estateId = rel(has('digitalEstate') ? data.digitalEstate : prior?.digitalEstate);
  const locale = has('locale') ? data.locale : prior?.locale;
  if (locale !== undefined && locale !== null && typeof locale !== 'string') {
    return 'Cannot verify page slug with an invalid locale';
  }

  const conflicting = await req.payload.find({
    collection: 'pages',
    where: {
      and: [
        { slug: { equals: value } },
        { tenant: { equals: tenantId } },
        estateId ? { digitalEstate: { equals: estateId } } : { digitalEstate: { exists: false } },
        locale ? { locale: { equals: locale } } : { locale: { exists: false } },
        id ? { id: { not_equals: id } } : {},
      ],
    },
    limit: 1,
    depth: 0,
    req,
    overrideAccess: true,
  });

  return conflicting.totalDocs > 0
    ? `Slug "${value}" is already used within this tenant/estate/locale scope (ADR-0012 §65-66).`
    : true;
};

/**
 * Flagship editorial content type. Demonstrates the full Baobab context
 * model: canonical identity (ADR-0013), tenant + legal-entity + digital
 * estate + market + locale scope (ADR-0012, ADR-0014), and canonical event
 * publication through the outbox (ADR-0018).
 *
 * `slug` is intentionally scoped, not globally unique — two tenants (or
 * two digital estates within a tenant) MAY legitimately publish the same
 * slug (ADR-0012 §65-66, CT-006).
 */
const Pages: CollectionConfig = {
  slug: 'pages',
  labels: {
    singular: 'Page',
    plural: 'Pages',
  },
  access: tenantScopedAccess({ writeCapability: 'content.management' }),
  hooks: {
    beforeChange: [pageGuard.beforeChange],
    beforeDelete: [pageGuard.beforeDelete],
    afterChange: [
      canonicalAfterChangeHook<{
        id: string | number;
        canonicalEntityId?: string;
        status?: PageStatus;
      }>({
        canonicalEntityType: 'PAGE',
        buildPayload: (doc) => ({
          id: doc.id,
          collection: 'pages',
          contentKey: (doc as { contentKey?: string }).contentKey,
          slug: (doc as { slug?: string }).slug,
        }),
        eventTypeFor: (operation, doc, previousDoc) => {
          if (operation === 'create') return CanonicalEventType.CONTENT_CREATED;
          if (doc.status === 'published' && previousDoc?.status !== 'published') {
            return CanonicalEventType.CONTENT_PUBLISHED;
          }
          if (doc.status !== 'published' && previousDoc?.status === 'published') {
            return CanonicalEventType.CONTENT_UNPUBLISHED;
          }
          if (doc.status === 'archived' && previousDoc?.status !== 'archived') {
            return CanonicalEventType.CONTENT_ARCHIVED;
          }
          return CanonicalEventType.CONTENT_UPDATED;
        },
      }),
    ],
    afterDelete: [
      canonicalAfterDeleteHook({
        canonicalEntityType: 'PAGE',
        buildPayload: (doc) => ({
          id: doc.id,
          collection: 'pages',
          contentKey: (doc as { contentKey?: string }).contentKey,
          slug: (doc as { slug?: string }).slug,
        }),
        eventTypeFor: () => CanonicalEventType.CONTENT_RETIRED,
      }),
    ],
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'slug', 'status', 'contentScope', 'digitalEstate', 'market', 'locale'],
  },
  fields: [
    canonicalIdField({ entityType: 'PAGE' }),
    tenantOwnedField(),
    sameTenantRelationshipField({
      name: 'organisation',
      relationTo: 'organisations',
      label: 'Legal entity (organisation)',
      required: true,
    }),
    sameTenantRelationshipField({ name: 'digitalEstate', relationTo: 'digital-estates', label: 'Digital estate' }),
    sameTenantRelationshipField({ name: 'market', relationTo: 'markets', label: 'Market' }),
    {
      name: 'locale',
      type: 'text',
      index: true,
      admin: {
        description:
          'Explicit content-resolution locale (ADR-0014 §11-12). Distinct from Payload field-level localization.',
      },
    },
    contentScopeField(),
    {
      name: 'contentKey',
      type: 'text',
      index: true,
      admin: {
        description: 'Stable, scoped key used by the content resolver (ADR-0014 §55-56), e.g. "home", "footer".',
      },
    },
    {
      name: 'title',
      type: 'text',
      required: true,
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      admin: { description: 'Scoped, not globally unique — see validation for (tenant, digitalEstate, locale) uniqueness.' },
      validate: validateScopedSlug,
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Draft', value: 'draft' },
        { label: 'Published', value: 'published' },
        { label: 'Archived', value: 'archived' },
      ],
      defaultValue: 'draft',
      admin: { description: 'Publication lifecycle (ADR-0012 §44). Maps onto the resolver\'s PublicationState.' },
    },
    {
      name: 'effectiveFrom',
      type: 'date',
      admin: { description: 'Temporal applicability start (ADR-0014 §43-44).' },
    },
    {
      name: 'effectiveTo',
      type: 'date',
      admin: { description: 'Temporal applicability end (ADR-0014 §43-44).' },
    },
    {
      name: 'regions',
      type: 'relationship',
      relationTo: 'regions',
      hasMany: true,
      index: true,
      admin: { description: 'Deprecated legacy field. Use `market`.' },
    },
    {
      name: 'content',
      type: 'richText',
    },
    // Home page fields the estate reads (contentKey "home"). Optional; absent fields fall back to estate defaults.
    { name: 'eyebrow', type: 'text', admin: { condition: (data) => data?.contentKey === 'home' } },
    { name: 'headline', type: 'text', admin: { condition: (data) => data?.contentKey === 'home' } },
    { name: 'introduction', type: 'textarea', admin: { condition: (data) => data?.contentKey === 'home' } },
    { name: 'institutionalStatement', type: 'textarea', admin: { condition: (data) => data?.contentKey === 'home' } },
    ...(['primaryCta', 'secondaryCta'] as const).map((name) => ({
      name,
      type: 'group' as const,
      admin: { condition: (data: Record<string, unknown>) => data?.contentKey === 'home' },
      fields: [
        { name: 'label', type: 'text' as const },
        { name: 'href', type: 'text' as const, validate: (v: string | null | undefined) => (v ? validateLinkTarget(v) : true) },
      ],
    })),
  ],
};

export default Pages;
