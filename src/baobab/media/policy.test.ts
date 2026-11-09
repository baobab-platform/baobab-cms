import { describe, expect, it } from 'vitest';
import Media from '../../collections/Media.js';
import { isMimeTypeAllowed, isSizeAllowed, containsUnsafeSvgMarkup, buildTenantScopedStorageKey } from './policy.js';

describe('media upload policy — ADR-0016 §38-40', () => {
  it('accepts governed mime types and rejects others', () => {
    expect(isMimeTypeAllowed('image/png')).toBe(true);
    expect(isMimeTypeAllowed('application/x-msdownload')).toBe(false);
  });

  it('enforces the size ceiling', () => {
    expect(isSizeAllowed(1024)).toBe(true);
    expect(isSizeAllowed(0)).toBe(false);
    expect(isSizeAllowed(100 * 1024 * 1024)).toBe(false);
  });

  it('flags inline script and event-handler SVG payloads as unsafe', () => {
    expect(containsUnsafeSvgMarkup('<svg><script>alert(1)</script></svg>')).toBe(true);
    expect(containsUnsafeSvgMarkup('<svg onload="alert(1)"></svg>')).toBe(true);
    expect(containsUnsafeSvgMarkup('<svg><circle r="4" /></svg>')).toBe(false);
  });
});

describe('buildTenantScopedStorageKey — ADR-0016 §15', () => {
  it('partitions the key by tenant and sanitises the filename', () => {
    const key = buildTenantScopedStorageKey({
      tenantId: 'tenant-a',
      canonicalMediaId: 'media-1',
      filename: 'my file (final)!.png',
    });
    expect(key).toBe('tenants/tenant-a/media/media-1/my_file__final__.png');
  });

  it('two tenants never collide on an identical filename', () => {
    const keyA = buildTenantScopedStorageKey({ tenantId: 'tenant-a', canonicalMediaId: 'm1', filename: 'logo.png' });
    const keyB = buildTenantScopedStorageKey({ tenantId: 'tenant-b', canonicalMediaId: 'm1', filename: 'logo.png' });
    expect(keyA).not.toBe(keyB);
  });
});

describe('ADR-0016 media upload boundary', () => {
  const validate = Media.hooks!.beforeValidate![0];
  const upload = (mimetype: string, data: Buffer, size = data.byteLength) =>
    () => validate({ req: { file: { mimetype, data, size } }, data: {} } as never);

  it('rejects active SVG markup and opaque SVG uploads before storage', () => {
    expect(upload('image/svg+xml', Buffer.from('<svg onload="alert(1)"/>'))).toThrow(/unsafe/);
    expect(() => validate({ req: { file: { mimetype: 'image/svg+xml', size: 9 } }, data: {} } as never))
      .toThrow(/uninspectable/);
    expect(upload('image/svg+xml', Buffer.from('<svg><circle r="4"/></svg>'))).not.toThrow();
  });
  it('enforces MIME and size policy at the Payload collection boundary', () => {
    expect(upload('application/x-msdownload', Buffer.from('exe'))).toThrow(/MIME/);
    expect(upload('image/png', Buffer.from('abc'), 0)).toThrow(/size/);
    expect(upload('image/png', Buffer.from('abc'), 30 * 1024 * 1024)).toThrow(/size/);
  });
  it('rejects path traversal in identity segments', () => {
    expect(() => buildTenantScopedStorageKey({ tenantId: '../other', canonicalMediaId: 'media-1', filename: 'ok.png' }))
      .toThrow(/tenant/);
    expect(() => buildTenantScopedStorageKey({ tenantId: 'tenant-a', canonicalMediaId: '..', filename: 'ok.png' }))
      .toThrow(/canonical media ID/);
  });
});
