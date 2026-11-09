import type { CollectionConfig } from 'payload';
import { tenantOwnedField, sameTenantRelationshipField } from '../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../baobab/tenancy/access.js';
import { canonicalIdField } from '../baobab/identity/field.js';

/**
 * Canonical market (ADR-0011 §11, ADR-0012 §4.4, ADR-0014 §10). A market is
 * a commercially meaningful operating context — geography, currency,
 * language, regulation, channel, brand, legal entity, and strategy may all
 * combine here. It is never reduced to a country, and never equated with a
 * deployment region or a locale.
 */
const Markets: CollectionConfig = {
  slug: 'markets',
  admin: {
    useAsTitle: 'name',
    description: 'Canonical market — never merely a country, region, or locale (ADR-0011 §11, ADR-0014 §10-13).',
  },
  access: tenantScopedAccess(),
  // CP-owned resource projection: CMS has no authority to originate a
  // canonical tenant/organisation/estate/market lifecycle event. The
  // Control Plane is the source of such events; CMS content records are
  // independently event-producing under ADR-0018.

  fields: [
    canonicalIdField({ authority: 'control-plane', name: 'canonicalMarketId', entityType: 'MARKET' }),
    tenantOwnedField(),
    sameTenantRelationshipField({ name: 'legalEntity', relationTo: 'organisations', label: 'Legal entity' }),
    { name: 'name', type: 'text', required: true },
    { name: 'code', type: 'text', required: true, index: true },
    { name: 'currency', type: 'text' },
    { name: 'geography', type: 'text', hasMany: true, admin: { description: 'One market may span several geographies.' } },
    { name: 'regulatoryRegime', type: 'text' },
    { name: 'channel', type: 'text' },
    { name: 'brand', type: 'text' },
    { name: 'supportedLocales', type: 'text', hasMany: true },
    { name: 'enabled', type: 'checkbox', defaultValue: true },
  ],
};

export default Markets;
