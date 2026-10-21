import type { CollectionConfig } from 'payload';
import { tenantOwnedField, sameTenantRelationshipField } from '../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../baobab/tenancy/access.js';
import { canonicalIdField } from '../baobab/identity/field.js';
import { canonicalAfterChangeHook, canonicalAfterDeleteHook } from '../baobab/events/hook.js';
import { CanonicalEventType } from '../baobab/events/types.js';

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
  hooks: {
    afterChange: [
      canonicalAfterChangeHook({
        canonicalEntityType: 'MARKET',
        eventTypeFor: (operation) =>
          operation === 'create' ? CanonicalEventType.CONTENT_CREATED : CanonicalEventType.CONTENT_UPDATED,
      }),
    ],
    afterDelete: [
      canonicalAfterDeleteHook({
        canonicalEntityType: 'MARKET',
        eventTypeFor: () => CanonicalEventType.CONTENT_ARCHIVED,
      }),
    ],
  },
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
