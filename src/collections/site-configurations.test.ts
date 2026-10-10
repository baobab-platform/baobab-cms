import { describe, expect, it } from 'vitest';
import type { Field } from 'payload';
import SiteConfigurations, { SITE_CONFIGURATION_KINDS, validateLinkTarget } from './SiteConfigurations.js';

const names = SiteConfigurations.fields.map((f) => ('name' in f ? f.name : undefined));

describe('site-configurations', () => {
  it('is a tenant-scoped, DRAFT-by-default, event-raising collection', () => {
    expect(SiteConfigurations.slug).toBe('site-configurations');
    for (const n of ['tenant', 'organisation', 'digitalEstate', 'locale', 'contentKey', 'publicationState', 'kind']) {
      expect(names).toContain(n);
    }
    const state = SiteConfigurations.fields.find((f) => 'name' in f && f.name === 'publicationState') as Field & { defaultValue?: string };
    expect(state.defaultValue).toBe('DRAFT');
    expect(SiteConfigurations.hooks?.afterChange?.length).toBeGreaterThan(0);
  });

  it('covers exactly the four singleton kinds', () => {
    expect([...SITE_CONFIGURATION_KINDS]).toEqual(['navigation', 'footer', 'site-settings', 'group-profile']);
  });

  it('derives contentKey and slug from kind', async () => {
    const hook = SiteConfigurations.hooks!.beforeValidate!.at(-1)!;
    const out = (await hook({ data: { kind: 'footer', contentKey: 'x', slug: 'y' } } as never)) as Record<string, string>;
    expect(out.contentKey).toBe('footer');
    expect(out.slug).toBe('footer');
  });

  it('accepts site paths and https URLs only', () => {
    expect(validateLinkTarget('/about')).toBe(true);
    expect(validateLinkTarget('https://example.com/x')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.example', 'about', '']) {
      expect(validateLinkTarget(bad), bad).not.toBe(true);
    }
  });

  it('holds no legal-identity fields', () => {
    const text = JSON.stringify(names);
    expect(text).not.toMatch(/registration|vat|taxRef|address/i);
  });
});
