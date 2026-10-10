import type { CollectionConfig } from 'payload';
import { canonicalAfterChangeHook, canonicalAfterDeleteHook } from '../baobab/events/hook.js';
import { CanonicalEventType } from '../baobab/events/types.js';
import { platformAdminOnlyAccess } from '../baobab/tenancy/access.js';
import { tryResolveContext } from '../baobab/context/resolve.js';

/**
 * Local, non-authoritative projection of the canonical Baobab tenant
 * (ADR-0012 §5-6). In a full deployment the Baobab Control Plane is
 * authoritative and this collection would be kept fresh by consuming
 * `tenant.updated` Control Plane events; no Control Plane exists in this
 * environment yet, so this collection is also the practical source of
 * truth for local development and tests — `lastSyncedAt` and
 * `isProjection` make that distinction explicit and auditable rather than
 * silently pretending Payload owns tenancy.
 */
const Tenants: CollectionConfig = {
  slug: 'tenants',
  admin: {
    useAsTitle: 'name',
    description: 'Local projection of the canonical tenant. The Control Plane remains authoritative once integrated.',
  },
  access: {
    read: ({ req }) => tryResolveContext(req) !== null,
    create: platformAdminOnlyAccess().create,
    update: platformAdminOnlyAccess().update,
    delete: platformAdminOnlyAccess().delete,
  },
  hooks: {
    afterChange: [
      canonicalAfterChangeHook({
        canonicalEntityType: 'TENANT',
        eventTypeFor: (operation) =>
          operation === 'create' ? CanonicalEventType.CONTENT_CREATED : CanonicalEventType.CONTENT_UPDATED,
      }),
    ],
    afterDelete: [
      canonicalAfterDeleteHook({
        canonicalEntityType: 'TENANT',
        eventTypeFor: () => CanonicalEventType.CONTENT_ARCHIVED,
      }),
    ],
  },
  fields: [
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
      name: 'controlPlaneTenantId',
      type: 'text',
      unique: true,
      index: true,
      validate: (value: string | null | undefined) =>
        !value || /^tn_[a-z0-9]+$/.test(value) ? true : 'Must be a Control Plane tenant id such as tn_abc123',
      admin: {
        description:
          'The Control Plane tenant id this projection mirrors. Set only from a Control Plane issuance, never invented. Content resolution maps validated contexts to this tenant through it.',
      },
    },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Suspended', value: 'suspended' },
        { label: 'Archived', value: 'archived' },
      ],
      defaultValue: 'active',
    },
    {
      name: 'isolationProfile',
      type: 'text',
      admin: { description: 'Reference to the applicable IsolationProfile (ADR-0012 §12, §77).' },
    },
    { name: 'defaultLocale', type: 'text', defaultValue: 'en' },
    { name: 'supportedLocales', type: 'text', hasMany: true },
    {
      name: 'isProjection',
      type: 'checkbox',
      defaultValue: true,
      admin: { readOnly: true, description: 'Always true — this record is a projection, never canonical authority.' },
    },
    {
      name: 'lastSyncedAt',
      type: 'date',
      admin: { description: 'Freshness marker for reconciliation against the Control Plane (ADR-0012 §6).' },
    },
    {
      name: 'metadata',
      type: 'json',
      admin: {
        description: 'Tenant metadata for future integrations and region configuration.',
      },
    },
  ],
};

export default Tenants;
