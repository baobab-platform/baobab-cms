import type { CollectionConfig } from 'payload';
import { tenantOwnedField, contentScopeField, sameTenantRelationshipField } from '../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../baobab/tenancy/access.js';
import { canonicalIdField } from '../baobab/identity/field.js';
import { canonicalAfterChangeHook, canonicalAfterDeleteHook } from '../baobab/events/hook.js';
import { CanonicalEventType } from '../baobab/events/types.js';

import { createPublicationGuard } from '../baobab/authorization/publication.js';

// Product editorial REVIEW remains non-public draft state for authorization.
// Live transitions still require both publisher role and content.publish.
const productGuard = createPublicationGuard({
  readState: (value) => {
    if (value === 'REVIEW') return 'DRAFT';
    if (value === 'DRAFT' || value === 'PUBLISHED' || value === 'UNPUBLISHED' || value === 'ARCHIVED') return value;
    return undefined;
  },
});

/**
 * Editorial product content (ADR-0015 §12-13). This is deliberately NOT a
 * clone of a commerce product: it carries only Payload-owned editorial
 * concerns (storytelling, SEO, editorial media). Price, SKU, variants,
 * inventory and sellability remain Medusa's authority and are never
 * duplicated here — `canonicalProductId` is the only link between them,
 * resolved through `src/baobab/mappings`, never guessed from a slug or
 * SKU (ADR-0015 §41, §101-104).
 */
const ProductContent: CollectionConfig = {
  slug: 'product-content',
  admin: {
    useAsTitle: 'headline',
    description: 'Editorial product content only. Commerce truth (price/SKU/inventory) stays in Medusa (ADR-0015).',
    defaultColumns: ['headline', 'canonicalProductId', 'publicationState', 'market', 'locale'],
  },
  access: tenantScopedAccess({ writeCapability: 'content.editorial-product' }),
  hooks: {
    beforeChange: [productGuard.beforeChange],
    beforeDelete: [productGuard.beforeDelete],
    afterChange: [
      canonicalAfterChangeHook<{
        id: string | number;
        canonicalEntityId?: string;
        publicationState?: string;
      }>({
        canonicalEntityType: 'PRODUCT',
        eventTypeFor: (operation, doc, previousDoc) => {
          if (operation === 'create') return CanonicalEventType.PRODUCT_CONTENT_CREATED;
          if (doc.publicationState === 'PUBLISHED' && previousDoc?.publicationState !== 'PUBLISHED') {
            return CanonicalEventType.PRODUCT_CONTENT_PUBLISHED;
          }
          if (doc.publicationState !== 'PUBLISHED' && previousDoc?.publicationState === 'PUBLISHED') {
            return CanonicalEventType.PRODUCT_CONTENT_UNPUBLISHED;
          }
          return CanonicalEventType.PRODUCT_CONTENT_UPDATED;
        },
      }),
    ],
    afterDelete: [
      canonicalAfterDeleteHook({
        canonicalEntityType: 'PRODUCT',
        eventTypeFor: () => CanonicalEventType.CONTENT_RETIRED,
      }),
    ],
  },
  fields: [
    canonicalIdField({ entityType: 'PRODUCT' }),
    tenantOwnedField(),
    {
      name: 'canonicalProductId',
      type: 'text',
      required: true,
      index: true,
      admin: {
        description:
          'Canonical Baobab product identity (resolved via src/baobab/mappings, never a Medusa/Payload local id or SKU) — ADR-0015 §8-11, §41.',
      },
    },
    sameTenantRelationshipField({ name: 'digitalEstate', relationTo: 'digital-estates', label: 'Digital estate' }),
    sameTenantRelationshipField({ name: 'market', relationTo: 'markets', label: 'Market' }),
    { name: 'locale', type: 'text', index: true },
    contentScopeField(),
    { name: 'headline', type: 'text' },
    { name: 'shortDescription', type: 'textarea' },
    { name: 'longDescription', type: 'richText' },
    {
      name: 'editorialMedia',
      type: 'relationship',
      relationTo: 'media',
      hasMany: true,
    },
    {
      name: 'seo',
      type: 'group',
      fields: [
        { name: 'title', type: 'text' },
        { name: 'description', type: 'textarea' },
      ],
    },
    { name: 'contentBlocks', type: 'richText', admin: { description: 'Structured merchandising narrative content.' } },
    {
      name: 'publicationState',
      type: 'select',
      required: true,
      defaultValue: 'DRAFT',
      options: ['DRAFT', 'REVIEW', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'].map((value) => ({ label: value, value })),
    },
    {
      name: 'commerceProjection',
      type: 'group',
      admin: {
        description:
          'Non-authoritative commerce projection for editorial convenience only (ADR-0015 §70-72). Never treated as live transactional truth.',
      },
      fields: [
        { name: 'status', type: 'text' },
        { name: 'skuSummary', type: 'text' },
        { name: 'variantSummary', type: 'text' },
        { name: 'lastSyncedAt', type: 'date' },
      ],
    },
  ],
};

export default ProductContent;
