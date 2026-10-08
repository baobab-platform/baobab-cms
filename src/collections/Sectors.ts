import { corporateCollection } from './corporate/shared.js';

/** Editorial sector pages. Field names match the estate's `Sector` content model. */
const Sectors = corporateCollection({
  slug: 'sectors',
  labels: { singular: 'Sector', plural: 'Sectors' },
  entityType: 'PAGE',
  useAsTitle: 'name',
  description: 'Editorial sector pages for the corporate site.',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'summary', type: 'textarea', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'heroMedia', type: 'relationship', relationTo: 'media' },
  ],
});

export default Sectors;
