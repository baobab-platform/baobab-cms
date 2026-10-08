import { describe, expect, it } from 'vitest';
import type { CollectionConfig, Field } from 'payload';
import PortfolioCompanies from '../PortfolioCompanies.js';
import Sectors from '../Sectors.js';
import Insights, { INSIGHT_CONTENT_TYPES } from '../Insights.js';
import { eventTypeFor, scopedSlugValidator, validateHttpUrl } from './shared.js';

const names = (collection: CollectionConfig) => collection.fields.map((f) => ('name' in f ? f.name : undefined));
const field = (collection: CollectionConfig, name: string): Field | undefined =>
  collection.fields.find((f) => 'name' in f && f.name === name);

describe('corporate collections', () => {
  const all: [string, CollectionConfig][] = [
    ['portfolio-companies', PortfolioCompanies],
    ['sectors', Sectors],
    ['insights', Insights],
  ];

  it.each(all)('%s carries tenant ownership, canonical identity and resolution scope', (slug, collection) => {
    expect(collection.slug).toBe(slug);
    for (const required of [
      'canonicalEntityId',
      'tenant',
      'organisation',
      'digitalEstate',
      'market',
      'locale',
      'contentScope',
      'contentKey',
      'slug',
      'publicationState',
      'effectiveFrom',
      'effectiveTo',
      'visibility',
      'seo',
    ]) {
      expect(names(collection), `${slug} lacks ${required}`).toContain(required);
    }
  });

  it.each(all)('%s is tenant-scoped, defaults to DRAFT and raises canonical events', (_slug, collection) => {
    expect(collection.access?.read).toBeTypeOf('function');
    expect(collection.access?.create).toBeTypeOf('function');
    expect(collection.hooks?.afterChange?.length).toBeGreaterThan(0);
    expect(collection.hooks?.afterDelete?.length).toBeGreaterThan(0);

    const state = field(collection, 'publicationState') as { defaultValue?: string; required?: boolean };
    expect(state.defaultValue).toBe('DRAFT');
    expect(state.required).toBe(true);
  });

  it.each(all)('%s makes the publishing legal entity mandatory but nothing else about ownership', (_slug, collection) => {
    expect((field(collection, 'organisation') as { required?: boolean }).required).toBe(true);
    expect(names(collection)).not.toContain('owner');
    expect(names(collection)).not.toContain('ownershipPercentage');
  });

  it('matches the field names the Nabhold estate reads for portfolio companies', () => {
    for (const name of [
      'slug', 'name', 'legalName', 'strapline', 'summary', 'description', 'sector', 'markets', 'website',
      'logo', 'heroMedia', 'investmentThesis', 'strategicRole', 'status', 'seo',
    ]) {
      expect(names(PortfolioCompanies), name).toContain(name);
    }
    expect((field(PortfolioCompanies, 'name') as { required?: boolean }).required).toBe(true);
    expect((field(PortfolioCompanies, 'summary') as { required?: boolean }).required).toBe(true);
  });

  it('keeps a profile’s subject reference separate from ownership', () => {
    const subject = field(PortfolioCompanies, 'subjectOrganisationId') as { admin?: { description?: string } };
    expect(subject.admin?.description).toMatch(/never establishes ownership/i);
  });

  it('matches the field names the Nabhold estate reads for sectors and insights', () => {
    for (const name of ['slug', 'name', 'summary', 'description', 'heroMedia', 'seo']) {
      expect(names(Sectors), name).toContain(name);
    }
    for (const name of [
      'slug', 'title', 'excerpt', 'body', 'authors', 'topics', 'sectors', 'contentType', 'publishedAt', 'heroMedia', 'seo',
    ]) {
      expect(names(Insights), name).toContain(name);
    }
    expect(INSIGHT_CONTENT_TYPES).toHaveLength(10);
    expect(INSIGHT_CONTENT_TYPES).toContain('press-release');
  });

  it('exposes SEO robots as the group the estate reads', () => {
    const seo = field(Insights, 'seo') as { fields: Field[] };
    const robots = seo.fields.find((f) => 'name' in f && f.name === 'robots') as { fields: Field[] };
    expect(robots.fields.map((f) => ('name' in f ? f.name : ''))).toEqual(['index', 'follow']);
  });
});

describe('validateHttpUrl', () => {
  it('accepts empty and http(s) URLs', () => {
    expect(validateHttpUrl(undefined)).toBe(true);
    expect(validateHttpUrl('')).toBe(true);
    expect(validateHttpUrl('https://example.com/path')).toBe(true);
    expect(validateHttpUrl('http://example.com')).toBe(true);
  });

  it('rejects script, data and relative URLs', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', 'ftp://example.com', '/relative', 'example.com']) {
      expect(validateHttpUrl(bad), bad).not.toBe(true);
    }
  });
});

describe('scopedSlugValidator', () => {
  const siblingData = { tenant: 't1', digitalEstate: 'd1', locale: 'en' };
  const withExisting = (totalDocs: number) =>
    ({
      req: { payload: { find: async () => ({ totalDocs }) } },
      siblingData,
      id: undefined,
    }) as never;

  it('accepts a unique slug and rejects a duplicate within the same scope', async () => {
    const validate = scopedSlugValidator('sectors');
    expect(await validate('mining', withExisting(0))).toBe(true);
    expect(await validate('mining', withExisting(1))).toMatch(/already used/);
  });

  it('rejects an empty slug and non-kebab-case slugs', async () => {
    const validate = scopedSlugValidator('sectors');
    expect(await validate('', withExisting(0))).toMatch(/required/i);
    for (const bad of ['Mining', 'min ing', 'mining_', '-mining', 'a--b']) {
      expect(await validate(bad, withExisting(0)), bad).toMatch(/lower-case/);
    }
  });

  it('defers while the tenant is still unassigned on create', async () => {
    const validate = scopedSlugValidator('sectors');
    const result = await validate('mining', { req: { payload: { find: async () => ({ totalDocs: 9 }) } }, siblingData: {} } as never);
    expect(result).toBe(true);
  });
});

describe('eventTypeFor', () => {
  it('maps publication-state transitions to canonical events', () => {
    expect(eventTypeFor('create', { publicationState: 'DRAFT' }, undefined)).toBe('content.created');
    expect(eventTypeFor('update', { publicationState: 'PUBLISHED' }, { publicationState: 'DRAFT' })).toBe('content.published');
    expect(eventTypeFor('update', { publicationState: 'UNPUBLISHED' }, { publicationState: 'PUBLISHED' })).toBe('content.unpublished');
    expect(eventTypeFor('update', { publicationState: 'ARCHIVED' }, { publicationState: 'PUBLISHED' })).toBe('content.archived');
    expect(eventTypeFor('update', { publicationState: 'PUBLISHED' }, { publicationState: 'PUBLISHED' })).toBe('content.updated');
  });
});
