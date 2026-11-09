import { describe, expect, it, vi } from 'vitest';
import { validateScopedSlug } from './Pages.js';

function reqForTenant(overrides: Record<string, unknown> = {}) {
  const find = vi.fn(async (_args: { where: unknown }) => ({ totalDocs: 0 }));
  const findByID = vi.fn(async (_args: { id: unknown }): Promise<Record<string, unknown> | null> => null);
  const req = {
    user: { id: 'editor', tenantId: 'tenant-a', ...overrides },
    headers: new Headers(),
    payload: { find, findByID },
  };
  return { req, find, findByID };
}

describe('ADR-0012: page slug canonical tenant uniqueness', () => {
  it('ignores a forged client tenant and checks the authenticated owner on create', async () => {
    const { req, find } = reqForTenant();
    const result = await validateScopedSlug('home', {
      req,
      siblingData: { tenant: 'tenant-b', digitalEstate: 'estate-a', locale: 'en-ZA' },
    } as never);
    expect(result).toBe(true);
    const where = JSON.stringify(find.mock.calls[0]![0]);
    expect(where).toContain('"tenant":{"equals":"tenant-a"}');
    expect(where).not.toContain('"tenant":{"equals":"tenant-b"}');
    expect(where).toContain('estate-a');
    expect(where).toContain('en-ZA');
  });

  it('does not silently skip a duplicate when tenant was not assigned before validation', async () => {
    const { req, find } = reqForTenant();
    find.mockResolvedValue({ totalDocs: 1 });
    const result = await validateScopedSlug('home', {
      req, siblingData: { digitalEstate: 'estate-a', locale: 'en-ZA' },
    } as never);
    expect(result).toMatch(/already used/);
    expect(find).toHaveBeenCalledOnce();
  });

  it('loads persisted estate and locale for partial slug updates', async () => {
    const { req, find, findByID } = reqForTenant();
    findByID.mockResolvedValue({
      id: 'page-1', tenant: 'tenant-a', digitalEstate: 'estate-existing', locale: 'en-UG',
    });
    const result = await validateScopedSlug('new-home', {
      req, id: 'page-1', siblingData: { slug: 'new-home' },
    } as never);
    expect(result).toBe(true);
    expect(findByID).toHaveBeenCalledOnce();
    const where = JSON.stringify(find.mock.calls[0]![0]);
    expect(where).toContain('estate-existing');
    expect(where).toContain('en-UG');
    expect(where).toContain('"not_equals":"page-1"');
  });

  it('refuses an update of a page owned by another tenant', async () => {
    const { req, find, findByID } = reqForTenant();
    findByID.mockResolvedValue({
      id: 'page-1', tenant: 'tenant-b', digitalEstate: 'estate-b', locale: 'en-ZA',
    });
    const result = await validateScopedSlug('home', {
      req, id: 'page-1', siblingData: { slug: 'home' },
    } as never);
    expect(result).toMatch(/does not belong/);
    expect(find).not.toHaveBeenCalled();
  });

  it('fails closed when no authenticated owner or platform tenant is supplied', async () => {
    const { req: ownerless } = reqForTenant();
    ownerless.user = null as never;
    expect(await validateScopedSlug('home', {
      req: ownerless, siblingData: { tenant: 'tenant-a' },
    } as never)).toMatch(/authorised context/);

    const { req: platform } = reqForTenant({ tenantId: null, platformAdministrator: true });
    expect(await validateScopedSlug('home', { req: platform, siblingData: {} } as never))
      .toMatch(/canonical tenant/);
  });

  it('requires an explicit tenant for a platform-scoped administrative create', async () => {
    const { req, find } = reqForTenant({ tenantId: null, platformAdministrator: true });
    const result = await validateScopedSlug('home', {
      req, siblingData: { tenant: 'tenant-b', digitalEstate: 'estate-b', locale: 'en-ZA' },
    } as never);
    expect(result).toBe(true);
    expect(JSON.stringify(find.mock.calls[0]![0])).toContain('"tenant":{"equals":"tenant-b"}');
  });
});
