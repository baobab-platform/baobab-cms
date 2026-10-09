import type { CollectionConfig, TextFieldSingleValidation } from 'payload';
import { validateLinkTarget } from './SiteConfigurations.js';
import { tenantOwnedField, contentScopeField, sameTenantRelationshipField } from '../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../baobab/tenancy/access.js';
import { canonicalIdField } from '../baobab/identity/field.js';
import { canonicalAfterChangeHook, canonicalAfterDeleteHook } from '../baobab/events/hook.js';
import { CanonicalEventType } from '../baobab/events/types.js';
import { asPageState, createPublicationGuard } from '../baobab/authorization/publication.js';

/** Transitional (ADR-0019 expand step): editors with editorial roles are enforced; legacy editors with none are not yet. */
const pageGuard = createPublicationGuard({ stateField: 'status', readState: asPageState, transitional: true });

type PageStatus = 'draft' | 'published' | 'archived';

/** ADR-0012 §65-66, CT-006 — slugs are scoped to (tenant, digitalEstate, locale), never globally unique. */
const validateScopedSlug: TextFieldSingleValidation = async (value, options) => {
  const { req, siblingData, id } = options;
  if (!value) return 'Slug is required';

  const siblingTenant = (siblingData as { tenant?: unknown } | undefined)?.tenant;
  const tenantId =
    typeof siblingTenant === 'object' && siblingTenant !== null ? (siblingTenant as { id: string }).id : siblingTenant;
  if (!tenantId) return true; // tenant is assigned server-side before this runs on create

  const siblingEstate = (siblingData as { digitalEstate?: unknown } | undefined)?.digitalEstate;
  const estateId =
    typeof siblingEstate === 'object' && siblingEstate !== null ? (siblingEstate as { id: string }).id : siblingEstate;
  const locale = (siblingData as { locale?: string } | undefined)?.locale;

  const conflicting = await req.payload.find({
    collection: 'pages',
    where: {
      and: [
        { slug: { equals: value } },
        { tenant: { equals: tenantId as string } },
        estateId ? { digitalEstate: { equals: estateId as string } } : { digitalEstate: { exists: false } },
        locale ? { locale: { equals: locale } } : { locale: { exists: false } },
        id ? { id: { not_equals: id } } : {},
      ],
    },
    limit: 1,
    depth: 0,
    req,
  });

  if (conflicting.totalDocs > 0) {
    return `Slug "${value}" is already used within this tenant/estate/locale scope (ADR-0012 §65-66).`;
  }
  return true;
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
