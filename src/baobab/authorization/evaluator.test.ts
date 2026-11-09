import { describe, expect, it } from 'vitest';
import { isAuthorized } from './evaluator.js';
import { EditorialRole, Permission } from './roles.js';
import type { TenantContext, PlatformContext } from '../context/types.js';

function tenantContext(overrides: Partial<TenantContext> = {}): TenantContext {
  return {
    kind: 'tenant',
    tenantId: 'tenant-a',
    actorId: 'actor-1',
    capabilities: [],
    isPlatformAdmin: false,
    correlationId: 'corr-1',
    ...overrides,
  };
}

const platformContext: PlatformContext = {
  kind: 'platform',
  actorId: 'sys',
  capabilities: [],
  isPlatformAdmin: true,
  correlationId: 'corr-1',
};

describe('isAuthorized — default-deny (ADR-0017 §29-30)', () => {
  it('denies when the actor has no matching role permission', () => {
    expect(
      isAuthorized({ context: tenantContext(), roles: [EditorialRole.VIEWER], permission: Permission.PUBLISH }),
    ).toBe(false);
  });

  it('CT-004: an Author cannot publish where Publisher permission is required', () => {
    expect(
      isAuthorized({ context: tenantContext(), roles: [EditorialRole.AUTHOR], permission: Permission.PUBLISH }),
    ).toBe(false);
  });

  it('a Publisher can publish', () => {
    expect(
      isAuthorized({ context: tenantContext(), roles: [EditorialRole.PUBLISHER], permission: Permission.PUBLISH }),
    ).toBe(true);
  });

  it('denies access to a resource owned by a different tenant', () => {
    expect(
      isAuthorized({
        context: tenantContext({ tenantId: 'tenant-a' }),
        roles: [EditorialRole.CONTENT_ADMINISTRATOR],
        permission: Permission.READ,
        resourceTenantId: 'tenant-b',
      }),
    ).toBe(false);
  });

  it('denies access to a digital estate the actor is not bound to', () => {
    expect(
      isAuthorized({
        context: tenantContext(),
        roles: [EditorialRole.EDITOR],
        permission: Permission.READ,
        resourceDigitalEstateId: 'estate-b',
        actorDigitalEstateIds: ['estate-a'],
      }),
    ).toBe(false);
  });

  it('denies estate-scoped operations without an explicit estate grant', () => {
    for (const actorDigitalEstateIds of [undefined, []]) {
      expect(isAuthorized({
        context: tenantContext(),
        roles: [EditorialRole.CONTENT_ADMINISTRATOR],
        permission: Permission.PUBLISH,
        resourceDigitalEstateId: 'estate-a',
        actorDigitalEstateIds,
      })).toBe(false);
    }
    expect(isAuthorized({
      context: tenantContext(), roles: [EditorialRole.PUBLISHER], permission: Permission.PUBLISH,
      resourceDigitalEstateId: 'estate-a', actorDigitalEstateIds: ['estate-a'],
    })).toBe(true);
  });

  it('a platform context always passes regardless of role', () => {
    expect(isAuthorized({ context: platformContext, roles: [], permission: Permission.ADMINISTER_CONTENT })).toBe(true);
  });

  it('a platform-admin flag on a tenant context also always passes', () => {
    expect(
      isAuthorized({
        context: tenantContext({ isPlatformAdmin: true }),
        roles: [],
        permission: Permission.ADMINISTER_CONTENT,
      }),
    ).toBe(true);
  });
});
