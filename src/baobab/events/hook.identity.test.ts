import { describe, expect, it } from 'vitest';
import { canonicalAfterChangeHook } from './hook.js';

const hook = canonicalAfterChangeHook({
  canonicalEntityType: 'MEDIA_ASSET',
  eventTypeFor: () => 'media.updated',
});

describe('ADR-0018 canonical event outbox identity', () => {
  const build = (doc: Record<string, unknown>) => {
    const rows: Array<Record<string, unknown>> = [];
    const req = {
      user: { id: 'actor', tenantId: 'tenant-a' },
      headers: new Headers(),
      payload: {
        create: async ({ data }: { data: Record<string, unknown> }) => { rows.push(data); return data; },
      },
    };
    return { rows, call: () => hook({ doc, operation: 'update', req, collection: {} } as never) };
  };

  it('uses canonicalMediaId instead of a Payload-local media id', async () => {
    const { rows, call } = build({ id: 'payload-local-123', canonicalMediaId: 'canonical-media-456', tenant: 'tenant-a' });
    await call();
    expect(rows).toHaveLength(1);
    const envelope = rows[0].envelope as Record<string, unknown>;
    expect(envelope.canonicalEntityId).toBe('canonical-media-456');
    expect(envelope.externalReference).toMatchObject({ externalId: 'payload-local-123' });
  });

  it('refuses to silently drop events without a canonical tenant', async () => {
    const { rows, call } = build({ id: '1', canonicalEntityId: 'canon-1' });
    await expect(call()).rejects.toThrow(/missing canonical tenant/);
    expect(rows).toHaveLength(0);
  });

  it('refuses local Payload ID substitution for missing canonical identity', async () => {
    const { rows, call } = build({ id: 'payload-only', tenant: 'tenant-a' });
    await expect(call()).rejects.toThrow(/missing canonical entity identity/);
    expect(rows).toHaveLength(0);
  });
});
