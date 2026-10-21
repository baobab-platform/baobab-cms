import type { CollectionConfig } from 'payload';
import { tenantOwnedField } from '../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../baobab/tenancy/access.js';
import { canonicalIdField } from '../baobab/identity/field.js';
import { canonicalAfterChangeHook, canonicalAfterDeleteHook } from '../baobab/events/hook.js';
import { CanonicalEventType } from '../baobab/events/types.js';

/**
 * Digital estate (ADR-0012 §4.3, ADR-0014 §14): an independently governed
 * digital experience. Never inferred from hostname/domain — domains are
 * routing configuration, not canonical identity (ADR-0012 §25).
 */
const DigitalEstates: CollectionConfig = {
  slug: 'digital-estates',
  admin: {
    useAsTitle: 'name',
    description: 'Canonical digital estate. Domains route to an estate; they are never its identity (ADR-0012 §25).',
  },
  access: tenantScopedAccess(),
  hooks: {
    afterChange: [
      canonicalAfterChangeHook({
        canonicalEntityType: 'DIGITAL_ESTATE',
        eventTypeFor: (operation) =>
          operation === 'create' ? CanonicalEventType.CONTENT_CREATED : CanonicalEventType.CONTENT_UPDATED,
      }),
    ],
    afterDelete: [
      canonicalAfterDeleteHook({
        canonicalEntityType: 'DIGITAL_ESTATE',
        eventTypeFor: () => CanonicalEventType.CONTENT_ARCHIVED,
      }),
    ],
  },
  fields: [
    canonicalIdField({ authority: 'control-plane', name: 'canonicalDigitalEstateId', entityType: 'DIGITAL_ESTATE' }),
    tenantOwnedField(),
    { name: 'name', type: 'text', required: true },
    { name: 'code', type: 'text', required: true, index: true },
    {
      name: 'domains',
      type: 'text',
      hasMany: true,
      admin: { description: 'Routing configuration only — never canonical identity (ADR-0012 §25).' },
    },
    { name: 'defaultLocale', type: 'text' },
    { name: 'defaultMarket', type: 'relationship', relationTo: 'markets' },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Inactive', value: 'inactive' },
      ],
      defaultValue: 'active',
    },
  ],
};

export default DigitalEstates;
