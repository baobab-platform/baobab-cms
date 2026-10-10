import { corporateCollection } from './corporate/shared.js';

export const INSIGHT_CONTENT_TYPES = [
  'insight',
  'research-note',
  'market-brief',
  'sector-outlook',
  'trade-intelligence',
  'investment-thesis',
  'regulatory-alert',
  'white-paper',
  'annual-review',
  'press-release',
] as const;

/**
 * Editorial insights and publications. Field names match the estate's
 * `Insight` content model. The CMS owns editorial publication; analysis and
 * evidence behind an insight may come from Pulse, but nothing here is an
 * authoritative financial or regulatory statement.
 */
const Insights = corporateCollection({
  slug: 'insights',
  labels: { singular: 'Insight', plural: 'Insights' },
  entityType: 'ARTICLE',
  useAsTitle: 'title',
  description: 'Editorial insights, research notes, briefs and press releases.',
  fields: [
    { name: 'title', type: 'text', required: true },
    { name: 'excerpt', type: 'textarea' },
    { name: 'body', type: 'richText', required: true },
    {
      name: 'contentType',
      type: 'select',
      options: INSIGHT_CONTENT_TYPES.map((value) => ({ label: value, value })),
      defaultValue: 'insight',
      required: true,
    },
    { name: 'publishedAt', type: 'date', required: true, index: true },
    {
      name: 'authors',
      type: 'array',
      fields: [
        { name: 'name', type: 'text', required: true },
        { name: 'title', type: 'text' },
        { name: 'avatar', type: 'relationship', relationTo: 'media' },
      ],
    },
    { name: 'topics', type: 'text', hasMany: true },
    { name: 'sectors', type: 'text', hasMany: true, admin: { description: 'Sector slugs.' } },
    { name: 'heroMedia', type: 'relationship', relationTo: 'media' },
  ],
});

export default Insights;
