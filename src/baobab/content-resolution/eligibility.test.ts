import { describe, expect, it } from 'vitest';
import { isTemporallyEligible } from './eligibility.js';
import { resolveContent } from './resolver.js';
import { InheritanceMode } from './types.js';
import { ContentScope } from '../tenancy/scope.js';
import type { ResolvableRecord } from './types.js';

const published: ResolvableRecord = {
  id: 'one', tenantId: 'tenant-a', contentKey: 'notice', publicationState: 'PUBLISHED',
};
describe('ADR-0014 fail-closed temporal content resolution', () => {
  it.each([
    ['not-a-date', {}],
    ['2026-11-09T12:00:00.000Z', { effectiveFrom: 'nonsense' }],
    ['2026-11-09T12:00:00.000Z', { effectiveTo: 'invalid' }],
    ['2026-11-09T12:00:00.000Z', { effectiveFrom: '2026-12-01T00:00:00Z', effectiveTo: '2026-11-01T00:00:00Z' }],
  ])('rejects invalid temporal parameters (%s, %j)', (at, data) => {
    expect(isTemporallyEligible({ ...published, ...data }, at)).toBe(false);
  });
  it('includes exact validity boundaries but excludes moments outside', () => {
    const record = { ...published, effectiveFrom: '2026-11-01T00:00:00Z', effectiveTo: '2026-11-30T00:00:00Z' };
    expect(isTemporallyEligible(record, record.effectiveFrom)).toBe(true);
    expect(isTemporallyEligible(record, record.effectiveTo)).toBe(true);
    expect(isTemporallyEligible(record, '2026-12-01T00:00:00Z')).toBe(false);
  });
  it('never selects a published record with corrupt effective-date metadata', () => {
    const result = resolveContent({ tenantId: 'tenant-a', contentKey: 'notice', effectiveTime: '2026-11-09T12:00:00Z' },
      [{ ...published, effectiveTo: 'not-a-date' }],
      { contentType: 'notice', inheritanceMode: InheritanceMode.INHERIT, supportedScopes: [ContentScope.MARKET] });
    expect(result.record).toBeNull();
  });
});
