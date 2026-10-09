import type { CollectionConfig, Field, TextFieldSingleValidation } from 'payload';
import { tenantOwnedField, contentScopeField, sameTenantRelationshipField } from '../../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../../baobab/tenancy/access.js';
import { canonicalIdField } from '../../baobab/identity/field.js';
import { canonicalAfterChangeHook, canonicalAfterDeleteHook } from '../../baobab/events/hook.js';
import { CanonicalEventType } from '../../baobab/events/types.js';
import { publicationGuardBeforeChange, publicationGuardBeforeDelete } from '../../baobab/authorization/publication.js';

/**
 * Building blocks for the corporate editorial collections that the Nabhold
 * estate reads (portfolio companies, sectors, insights). They follow the
 * `pages` collection's patterns: canonical identity (ADR-0013), tenant
 * ownership and scope (ADR-0012), explicit resolution locale and content key
 * (ADR-0014), and canonical events through the outbox (ADR-0018).
 *
 * Editorial profile is not corporate truth. A portfolio profile may name the
 * company it describes, but that reference never establishes ownership or a
 * legal relationship; those facts live in the Control Plane.
 */

export type PublicationState = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

export const PUBLICATION_STATES: PublicationState[] = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'];

export const VISIBILITY_LEVELS = ['public', 'registered', 'client', 'premium', 'board'] as const;

type RelationValue = unknown;

function relationId(value: RelationValue): string | undefined {
  if (typeof value === 'object' && value !== null) return (value as { id?: string }).id;
  return typeof value === 'string' ? value : undefined;
}

/** Slugs are unique within (tenant, digital estate, locale), never globally (ADR-0012 §65-66). */
export function scopedSlugValidator(collection: string): TextFieldSingleValidation {
  return async (value, options) => {
    const { req, siblingData, id } = options;
    if (!value) return 'Slug is required';
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value)) {
      return 'Slug must be lower-case words separated by single hyphens';
    }

    const data = siblingData as { tenant?: unknown; digitalEstate?: unknown; locale?: string } | undefined;
    const tenantId = relationId(data?.tenant);
    if (!tenantId) return true; // assigned server-side before this runs on create

    const estateId = relationId(data?.digitalEstate);
    const locale = data?.locale;

    const conflicting = await req.payload.find({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      collection: collection as any,
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
    });

    return conflicting.totalDocs > 0
      ? `Slug "${value}" is already used within this tenant/estate/locale scope (ADR-0012 §65-66).`
      : true;
  };
}

/** Accepts only absolute http(s) URLs, so an editor cannot publish a javascript: or data: link. */
export const validateHttpUrl = (value: string | null | undefined): true | string => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? true : 'Only http(s) URLs are allowed';
  } catch {
    return 'Enter an absolute URL such as https://example.com';
  }
};

export const seoGroup: Field = {
  name: 'seo',
  type: 'group',
  fields: [
    { name: 'title', type: 'text' },
    { name: 'description', type: 'textarea' },
    { name: 'openGraphTitle', type: 'text' },
    { name: 'openGraphDescription', type: 'textarea' },
    { name: 'openGraphImage', type: 'relationship', relationTo: 'media' },
    {
      name: 'canonicalOverride',
      type: 'text',
      validate: validateHttpUrl,
      admin: { description: 'Optional. The estate validates it resolves to its own origin before use.' },
    },
    {
      name: 'robots',
      type: 'group',
      fields: [
        { name: 'index', type: 'checkbox', defaultValue: true },
        { name: 'follow', type: 'checkbox', defaultValue: true },
      ],
    },
  ],
};

/** Fields every corporate editorial record carries, in the order editors see them. */
export function editorialScopeFields(collection: string, entityType: string): Field[] {
  return [
    canonicalIdField({ entityType }),
    tenantOwnedField(),
    sameTenantRelationshipField({
      name: 'organisation',
      relationTo: 'organisations',
      label: 'Publishing legal entity (organisation)',
      required: true,
    }),
    sameTenantRelationshipField({ name: 'digitalEstate', relationTo: 'digital-estates', label: 'Digital estate' }),
    sameTenantRelationshipField({ name: 'market', relationTo: 'markets', label: 'Market' }),
    {
      name: 'locale',
      type: 'text',
      index: true,
      admin: { description: 'Explicit content-resolution locale (ADR-0014 §11-12), for example en-ZA.' },
    },
    contentScopeField(),
    {
      name: 'contentKey',
      type: 'text',
      index: true,
      admin: { description: 'Stable key used by the content resolver (ADR-0014 §55-56).' },
    },
    {
      name: 'slug',
      type: 'text',
      required: true,
      index: true,
      validate: scopedSlugValidator(collection),
    },
    {
      name: 'publicationState',
      type: 'select',
      options: PUBLICATION_STATES.map((value) => ({ label: value, value })),
      defaultValue: 'DRAFT',
      required: true,
      index: true,
    },
    { name: 'effectiveFrom', type: 'date' },
    { name: 'effectiveTo', type: 'date' },
    {
      name: 'visibility',
      type: 'select',
      options: VISIBILITY_LEVELS.map((value) => ({ label: value, value })),
      defaultValue: 'public',
      required: true,
      admin: {
        description:
          'Recorded on the content. Entitlement enforcement is a platform capability, not Payload (ADR-0011).',
      },
    },
  ];
}

/** Canonical event type for a publication-state transition (ADR-0018). */
export function eventTypeFor(
  operation: 'create' | 'update' | 'delete',
  doc: { publicationState?: string },
  previousDoc: { publicationState?: string } | undefined,
): string {
  if (operation === 'create') return CanonicalEventType.CONTENT_CREATED;
  const now = doc.publicationState;
  const before = previousDoc?.publicationState;
  if (now === 'PUBLISHED' && before !== 'PUBLISHED') return CanonicalEventType.CONTENT_PUBLISHED;
  if (now === 'UNPUBLISHED' && before !== 'UNPUBLISHED') return CanonicalEventType.CONTENT_UNPUBLISHED;
  if (now === 'ARCHIVED' && before !== 'ARCHIVED') return CanonicalEventType.CONTENT_ARCHIVED;
  return CanonicalEventType.CONTENT_UPDATED;
}

export function corporateCollection(params: {
  slug: string;
  labels: { singular: string; plural: string };
  entityType: string;
  useAsTitle: string;
  description: string;
  fields: Field[];
}): CollectionConfig {
  return {
    slug: params.slug,
    labels: params.labels,
    access: tenantScopedAccess({ writeCapability: 'content.management' }),
    admin: {
      useAsTitle: params.useAsTitle,
      description: params.description,
      defaultColumns: [params.useAsTitle, 'slug', 'publicationState', 'digitalEstate', 'locale'],
    },
    hooks: {
      beforeChange: [publicationGuardBeforeChange],
      beforeDelete: [publicationGuardBeforeDelete],
      afterChange: [
        canonicalAfterChangeHook<{ id: string | number; canonicalEntityId?: string; publicationState?: string }>({
          canonicalEntityType: params.entityType,
          eventTypeFor,
        }),
      ],
      afterDelete: [
        canonicalAfterDeleteHook({
          canonicalEntityType: params.entityType,
          eventTypeFor: () => CanonicalEventType.CONTENT_RETIRED,
        }),
      ],
    },
    fields: [...editorialScopeFields(params.slug, params.entityType), ...params.fields, seoGroup],
  };
}
