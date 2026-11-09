import { describe, expect, it } from 'vitest';
import { InMemoryMappingResolver } from './resolver.js';
import type { ExternalReference, MappingScope } from './types.js';

const ref: ExternalReference = { engine: 'PAYLOAD', engineInstanceId: 'ei_a', externalType: 'page', externalId: '123' };
const full: MappingScope = { tenantId: 'tenant-a', legalEntityId: 'org-a', digitalEstateId: 'estate-a', marketId: 'UG' };

describe('ADR-0013 mapping scope must not broaden authority', () => {
  it('does not reveal legal entity/estate/market-scoped mappings to a wider query', async () => {
    const resolver = new InMemoryMappingResolver();
    await resolver.createMapping({
      canonicalEntityId: 'canonical-a', canonicalEntityType: 'PAGE', externalReference: ref,
      scope: full, provenance: 'MANUAL', idempotencyKey: 'first',
    });
    for (const partial of [
      { tenantId: 'tenant-a' },
      { tenantId: 'tenant-a', legalEntityId: 'org-a' },
      { tenantId: 'tenant-a', legalEntityId: 'org-a', digitalEstateId: 'estate-a' },
      { ...full, marketId: 'ZA' },
      { ...full, legalEntityId: 'org-b' },
      { ...full, digitalEstateId: 'estate-b' },
      { ...full, tenantId: 'tenant-b' },
    ]) {
      expect(await resolver.resolveByExternalReference(ref, partial)).toBeNull();
      expect(await resolver.resolveByCanonicalId('canonical-a', partial)).toHaveLength(0);
    }
    expect((await resolver.resolveByExternalReference(ref, full))?.canonicalEntityId).toBe('canonical-a');
  });

  it('permits broader mapping projections within the same tenant', async () => {
    const resolver = new InMemoryMappingResolver();
    await resolver.createMapping({
      canonicalEntityId: 'global-in-tenant', canonicalEntityType: 'PAGE', externalReference: ref,
      scope: { tenantId: 'tenant-a' }, provenance: 'MANUAL', idempotencyKey: 'second',
    });
    expect(await resolver.resolveByExternalReference(ref, full)).not.toBeNull();
    expect(await resolver.resolveByExternalReference(ref, { tenantId: 'tenant-b' })).toBeNull();
  });
});
