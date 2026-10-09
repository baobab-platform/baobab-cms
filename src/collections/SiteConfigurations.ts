import type { Field, TextFieldSingleValidation } from 'payload';
import { corporateCollection, validateHttpUrl } from './corporate/shared.js';

/**
 * Singleton corporate content: navigation, footer, site settings and the group
 * profile.
 *
 * Why a collection, not Payload Globals and not `pages`
 * -----------------------------------------------------
 * - Globals are one document per installation. Singleton content here must
 *   exist once per (tenant, digital estate, locale) and be tenant-isolated,
 *   scope-resolved (ADR-0014) and event-producing (ADR-0018). Globals can do
 *   none of those.
 * - `pages` models routable, slugged documents. Navigation and footer are not
 *   routes, and stretching `pages` would mix structured configuration into
 *   page bodies.
 * - So each kind is one row per scope in this collection. `contentKey` is the
 *   kind itself (`navigation`, `footer`, `site-settings`, `group-profile`),
 *   which is what `content.entry.resolve` is asked for. The home page stays a
 *   `pages` record with contentKey `home`.
 *
 * Nothing here records registration, tax or address facts; those live in the
 * Control Plane and Shared.
 */

export const SITE_CONFIGURATION_KINDS = ['navigation', 'footer', 'site-settings', 'group-profile'] as const;
export type SiteConfigurationKind = (typeof SITE_CONFIGURATION_KINDS)[number];

/** A site-relative path or an absolute http(s) URL. Blocks javascript:, data: and protocol-relative links. */
export const validateLinkTarget = (value: string | null | undefined): true | string => {
  if (!value) return 'A link target is required';
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  return validateHttpUrl(value);
};

const link = (name: string, label: string): Field => ({
  name,
  type: 'group',
  label,
  fields: [
    { name: 'label', type: 'text', required: true },
    { name: 'href', type: 'text', required: true, validate: validateLinkTarget },
  ],
});

const isKind = (kind: SiteConfigurationKind) => (data: { kind?: string }) => data?.kind === kind;

/** Exactly one record per (tenant, digital estate, locale, kind). */
const singletonValidator: TextFieldSingleValidation = async (value, { req, siblingData, id }) => {
  if (!value || !(SITE_CONFIGURATION_KINDS as readonly string[]).includes(value)) {
    return `Kind must be one of ${SITE_CONFIGURATION_KINDS.join(', ')}`;
  }
  const data = siblingData as { tenant?: unknown; digitalEstate?: unknown; locale?: string } | undefined;
  const rel = (v: unknown) => (typeof v === 'object' && v !== null ? (v as { id?: string }).id : (v as string | undefined));
  const tenantId = rel(data?.tenant);
  if (!tenantId) return true;
  const estateId = rel(data?.digitalEstate);

  const clash = await req.payload.find({
    collection: 'site-configurations' as never,
    where: {
      and: [
        { kind: { equals: value } },
        { tenant: { equals: tenantId } },
        estateId ? { digitalEstate: { equals: estateId } } : { digitalEstate: { exists: false } },
        data?.locale ? { locale: { equals: data.locale } } : { locale: { exists: false } },
        id ? { id: { not_equals: id } } : {},
      ],
    } as never,
    limit: 1,
    depth: 0,
    req,
  });
  return clash.totalDocs > 0 ? `A "${value}" record already exists for this tenant, estate and locale` : true;
};

const SiteConfigurations = corporateCollection({
  slug: 'site-configurations',
  labels: { singular: 'Site configuration', plural: 'Site configurations' },
  entityType: 'SITE_CONFIGURATION',
  useAsTitle: 'title',
  description: 'One record per estate, locale and kind: navigation, footer, site settings or group profile.',
  fields: [
    { name: 'title', type: 'text', required: true },
    {
      name: 'kind',
      type: 'select',
      required: true,
      index: true,
      options: SITE_CONFIGURATION_KINDS.map((value) => ({ label: value, value })),
      validate: singletonValidator as never,
    },
    {
      name: 'navigation',
      type: 'array',
      admin: { condition: isKind('navigation'), description: 'Primary navigation, at most two levels.' },
      maxRows: 12,
      fields: [
        link('item', 'Item'),
        { name: 'children', type: 'array', maxRows: 12, fields: [link('item', 'Child item')] },
      ],
    },
    {
      name: 'footer',
      type: 'group',
      admin: { condition: isKind('footer') },
      fields: [
        {
          name: 'columns',
          type: 'array',
          maxRows: 6,
          fields: [
            { name: 'heading', type: 'text', required: true },
            { name: 'links', type: 'array', maxRows: 12, fields: [link('item', 'Link')] },
          ],
        },
        { name: 'legalLine', type: 'textarea', admin: { description: 'Copyright or similar line. Do not enter registration numbers here unless the legal team approves.' } },
      ],
    },
    {
      name: 'settings',
      type: 'group',
      admin: { condition: isKind('site-settings') },
      fields: [
        { name: 'siteName', type: 'text', required: true },
        { name: 'tagline', type: 'text' },
        { name: 'logo', type: 'relationship', relationTo: 'media' },
        { name: 'social', type: 'array', maxRows: 10, fields: [{ name: 'network', type: 'text', required: true }, { name: 'url', type: 'text', required: true, validate: validateHttpUrl }] },
      ],
    },
    {
      name: 'profile',
      type: 'group',
      admin: { condition: isKind('group-profile') },
      fields: [
        { name: 'headline', type: 'text', required: true },
        { name: 'summary', type: 'textarea', required: true },
        { name: 'sections', type: 'array', maxRows: 20, fields: [{ name: 'heading', type: 'text', required: true }, { name: 'body', type: 'textarea', required: true }] },
      ],
    },
  ],
});

// The kind is the resolution key; editors never type contentKey or slug for a singleton.
SiteConfigurations.hooks = {
  ...SiteConfigurations.hooks,
  beforeValidate: [
    ...(SiteConfigurations.hooks?.beforeValidate ?? []),
    ({ data }) => {
      if (data && typeof data.kind === 'string') {
        data.contentKey = data.kind;
        data.slug = data.kind;
      }
      return data;
    },
  ],
};

export default SiteConfigurations;
