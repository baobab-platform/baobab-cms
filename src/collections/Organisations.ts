import type { CollectionConfig } from 'payload';
import { tenantOwnedField } from '../baobab/tenancy/fields.js';
import { tenantScopedAccess } from '../baobab/tenancy/access.js';
import { canonicalIdField } from '../baobab/identity/field.js';
import { canonicalAfterChangeHook, canonicalAfterDeleteHook } from '../baobab/events/hook.js';
import { CanonicalEventType } from '../baobab/events/types.js';

/**
 * Legal entity within a tenant (ADR-0012 §4.2, §23). A legal entity is the
 * *default* tenant boundary, never a synonym for tenancy itself — a tenant
 * MAY contain several of these.
 */
const Organisations: CollectionConfig = {
  slug: 'organisations',
  admin: {
    useAsTitle: 'name',
    description: 'Legal entity within a tenant (ADR-0012 §23). Distinct from — never a synonym for — tenancy.',
  },
  access: tenantScopedAccess(),
  hooks: {
    afterChange: [
      canonicalAfterChangeHook({
        canonicalEntityType: 'LEGAL_ENTITY',
        eventTypeFor: (operation) =>
          operation === 'create' ? CanonicalEventType.CONTENT_CREATED : CanonicalEventType.CONTENT_UPDATED,
      }),
    ],
    afterDelete: [
      canonicalAfterDeleteHook({
        canonicalEntityType: 'LEGAL_ENTITY',
        eventTypeFor: () => CanonicalEventType.CONTENT_ARCHIVED,
      }),
    ],
  },
  fields: [
    canonicalIdField({ name: 'canonicalLegalEntityId', entityType: 'LEGAL_ENTITY' }),
    tenantOwnedField(),
    {
      name: 'controlPlaneOrganisationId',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        description:
          'The Control Plane PRIMARY Organisation id this projection mirrors (ADR-BCP-027). Set only from a Control Plane issuance, never invented and never derived from a legal entity. canonicalLegalEntityId is a separate, optional legal-actor reference.',
      },
    },
    {
      name: 'name',
      type: 'text',
      required: true,
    },
    {
      name: 'code',
      type: 'text',
      required: true,
      unique: true,
    },
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

export default Organisations;
