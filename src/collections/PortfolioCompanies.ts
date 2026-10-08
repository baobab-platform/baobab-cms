import { corporateCollection, validateHttpUrl } from './corporate/shared.js';

/**
 * Editorial profile of a group company, as shown on a corporate site.
 * Field names match the Nabhold estate's `PortfolioCompany` content model
 * (nabhold `docs/content-model.md`), so its adapter reads them unchanged.
 *
 * This is editorial content, not corporate truth. `subjectOrganisationId`
 * only names the company a profile describes; ownership, control and market
 * participation come from the Control Plane's effective-dated graph and are
 * never established, or contradicted, by what this collection says.
 */
const PortfolioCompanies = corporateCollection({
  slug: 'portfolio-companies',
  labels: { singular: 'Portfolio company', plural: 'Portfolio companies' },
  entityType: 'PORTFOLIO_PROFILE',
  useAsTitle: 'name',
  description: 'Editorial profiles of group companies. Not a source of ownership or legal facts.',
  fields: [
    { name: 'name', type: 'text', required: true },
    { name: 'legalName', type: 'text' },
    { name: 'strapline', type: 'text' },
    { name: 'summary', type: 'textarea', required: true },
    { name: 'description', type: 'textarea' },
    { name: 'sector', type: 'text', admin: { description: 'Sector slug, as used by the sectors collection.' } },
    { name: 'markets', type: 'text', admin: { description: 'Free-text editorial description, not a market id.' } },
    { name: 'website', type: 'text', validate: validateHttpUrl },
    { name: 'logo', type: 'relationship', relationTo: 'media' },
    { name: 'heroMedia', type: 'relationship', relationTo: 'media' },
    { name: 'investmentThesis', type: 'textarea' },
    { name: 'strategicRole', type: 'textarea' },
    {
      name: 'status',
      type: 'select',
      options: [
        { label: 'Active', value: 'active' },
        { label: 'Dormant', value: 'dormant' },
        { label: 'Exited', value: 'exited' },
      ],
      defaultValue: 'active',
      admin: { description: 'Editorial status of the company, not the publication state of this record.' },
    },
    {
      name: 'subjectOrganisationId',
      type: 'text',
      index: true,
      admin: {
        description:
          'Canonical legal-entity id of the company this profile describes, for display only. Never establishes ownership.',
      },
    },
  ],
});

export default PortfolioCompanies;
