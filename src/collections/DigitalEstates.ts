import type { CollectionConfig } from 'payload';
import { tenantOwnedField } from '../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../baobab/tenancy/access.js';
import { canonicalIdField } from '../baobab/identity/field.js';

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
  // CP-owned resource projection: CMS has no authority to originate a
  // canonical tenant/organisation/estate/market lifecycle event. The
  // Control Plane is the source of such events; CMS content records are
  // independently event-producing under ADR-0018.

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
