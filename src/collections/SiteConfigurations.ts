import type { TextFieldSingleValidation } from 'payload';
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
    // Field names follow the estate's content contract (nabhold src/integrations/payload/dto/page.dto.ts).
    {
      name: 'navigationItems',
      type: 'array',
      maxRows: 12,
      admin: { condition: isKind('navigation'), description: 'Primary navigation.' },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true, validate: validateLinkTarget },
      ],
    },
    {
      name: 'statement',
      type: 'textarea',
      admin: { condition: isKind('footer'), description: 'Footer statement. No registration numbers unless the legal team approves.' },
    },
    { name: 'tagline', type: 'text', admin: { condition: isKind('footer') } },
    {
      name: 'footerLinks',
      type: 'array',
      maxRows: 12,
      admin: { condition: isKind('footer') },
      fields: [
        { name: 'label', type: 'text', required: true },
        { name: 'href', type: 'text', required: true, validate: validateLinkTarget },
      ],
    },
    { name: 'siteName', type: 'text', admin: { condition: isKind('site-settings') } },
    {
      name: 'body',
      type: 'array',
      maxRows: 40,
      admin: { condition: isKind('group-profile'), description: 'Group profile text as headings and paragraphs.' },
      fields: [
        { name: 'type', type: 'select', required: true, defaultValue: 'paragraph', options: ['heading', 'paragraph'] },
        { name: 'text', type: 'textarea', required: true },
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
