import type { CollectionConfig } from 'payload';
import { issueCanonicalEntityId } from '../baobab/identity/canonical.js';
import { EditorialRole } from '../baobab/authorization/roles.js';
import { platformAdministratorOnlyField } from '../baobab/authorization/publication.js';

/**
 * Payload users are a Content-Engine-local projection of a canonical
 * platform actor (ADR-0017 §5-6). They are never the enterprise identity
 * authority; `canonicalActorId` is the stable identity other engines and
 * events reference.
 *
 * `tenantID` / `organisationID` / `region` are the pre-existing (legacy)
 * free-text fields from the original installation, preserved unmodified
 * for backward compatibility (ADR-0019 §21-23 expand-and-contract). The
 * canonical replacements below (`tenantId`, `legalEntityId`,
 * `digitalEstateIds`, `marketIds`, `locales`) are additive and are what
 * `src/baobab/context` actually resolves against — see
 * `docs/architecture/tenancy.md` for the migration plan that eventually
 * retires the legacy fields.
 */
const Users: CollectionConfig = {
  slug: 'users',
  auth: {
    verify: true,
    tokenExpiration: 60 * 60 * 24 * 7,
    useAPIKey: true,
  },
  admin: {
    useAsTitle: 'email',
    defaultColumns: ['email', 'tenantId', 'editorialRoles', 'platformAdministrator'],
    description: 'Content Engine local actor projection. Canonical identity lives outside Payload (ADR-0017).',
  },
  access: {
    // Bootstrap-friendly: any authenticated actor may read their own
    // projection; only platform administrators manage the full roster.
    read: ({ req }) => {
      if (!req.user) return false;
      if (req.user.platformAdministrator === true) return true;
      return { id: { equals: req.user.id } };
    },
    create: ({ req }) => req.user?.platformAdministrator === true,
    update: ({ req, id }) => {
      if (!req.user) return false;
      if (req.user.platformAdministrator === true) return true;
      return req.user.id === id;
    },
    delete: ({ req }) => req.user?.platformAdministrator === true,
  },
  fields: [
    {
      name: 'canonicalActorId',
      type: 'text',
      unique: true,
      index: true,
      admin: { readOnly: true, description: 'Canonical actor identity (ADR-0017 §5). Immutable once assigned.' },
      access: { update: () => false },
      hooks: {
        beforeChange: [
          ({ value, operation, originalDoc }) => {
            if (operation === 'create') return value || issueCanonicalEntityId();
            return originalDoc?.canonicalActorId ?? value ?? issueCanonicalEntityId();
          },
        ],
      },
    },
    {
      name: 'tenantId',
      access: { update: platformAdministratorOnlyField },
      type: 'text',
      index: true,
      admin: { description: 'Canonical tenant this actor is bound to (ADR-0012). Required unless platformAdministrator.' },
    },
    { name: 'legalEntityId',
      access: { update: platformAdministratorOnlyField }, type: 'text' },
    {
      name: 'digitalEstateIds',
      access: { update: platformAdministratorOnlyField },
      type: 'text',
      hasMany: true,
      admin: { description: 'Authorized digital-estate bindings. Empty = unrestricted within tenant.' },
    },
    { name: 'marketIds',
      access: { update: platformAdministratorOnlyField }, type: 'text', hasMany: true },
    { name: 'locales',
      access: { update: platformAdministratorOnlyField }, type: 'text', hasMany: true },
    {
      name: 'editorialRoles',
      access: { update: platformAdministratorOnlyField },
      type: 'select',
      hasMany: true,
      options: Object.values(EditorialRole).map((value) => ({ label: value, value })),
      admin: { description: 'Content-Engine editorial roles (ADR-0017 §17-23). Not platform administration.' },
    },
    {
      name: 'ssoSubject',
      type: 'text',
      unique: true,
      index: true,
      admin: {
        readOnly: true,
        description:
          'Workforce SSO identity, "{issuer}#{subject}" (Gate IAM-5 phase 2b, ADR-0009 §9). Set only by the OIDC callback; never client-settable.',
      },
      access: { update: () => false },
    },
    {
      name: 'capabilities',
      access: { update: platformAdministratorOnlyField },
      type: 'text',
      hasMany: true,
      admin: { description: 'Capability bindings this actor carries in the current context (ADR-0011 §35).' },
    },
    {
      name: 'platformAdministrator',
      type: 'checkbox',
      defaultValue: false,
      access: {
        // Only an existing platform administrator may grant this flag —
        // it can never be self-escalated (ADR-0017 §47, default-deny).
        update: ({ req }) => req.user?.platformAdministrator === true,
      },
      admin: { description: 'Highly privileged platform identity (ADR-0012 §21-22, ADR-0017 §47). Minimise and audit.' },
    },
    {
      name: 'serviceIdentity',
      access: { update: platformAdministratorOnlyField },
      type: 'checkbox',
      defaultValue: false,
      admin: { description: 'Marks this as a service/automation identity rather than a human editor (ADR-0017 §50).' },
    },
    // Legacy fields — unchanged from the original installation.
    {
      name: 'tenantID',
      access: { update: platformAdministratorOnlyField },
      type: 'text',
      index: true,
      admin: { description: 'Deprecated legacy field. Use tenantId.' },
    },
    {
      name: 'organisationID',
      access: { update: platformAdministratorOnlyField },
      type: 'text',
      index: true,
      admin: { description: 'Deprecated legacy field. Use legalEntityId.' },
    },
    {
      name: 'region',
      access: { update: platformAdministratorOnlyField },
      type: 'text',
      defaultValue: 'GLOBAL',
      index: true,
      admin: { description: 'Deprecated legacy field. Use marketIds.' },
    },
    {
      name: 'roles',
      access: { update: platformAdministratorOnlyField },
      type: 'select',
      options: [
        { label: 'Admin', value: 'admin' },
        { label: 'Editor', value: 'editor' },
        { label: 'Viewer', value: 'viewer' },
      ],
      hasMany: true,
      defaultValue: ['editor'],
      admin: { description: 'Deprecated legacy field. Use editorialRoles.' },
    },
  ],
};

export default Users;
