import { describe, expect, it } from 'vitest';
import { healthEndpoints } from './endpoints.js';

const ready = healthEndpoints.find((e) => e.path === '/health/ready')!.handler;

describe('ADR-0020 readiness health boundary', () => {
  it('queries real database/outbox state without relying on anonymous collection access', async () => {
    const args: Record<string, unknown>[] = [];
    const req = { payload: {
      async find(input: Record<string, unknown>) { args.push(input); return { docs: [] }; },
      async count(input: Record<string, unknown>) { args.push(input); return { totalDocs: 0 }; },
    } };
    const response = await ready(req as never);
    expect(response.status).toBe(200);
    expect(args).toHaveLength(2);
    for (const query of args) expect(query.overrideAccess).toBe(true);
  });

  it('returns 503 without leaking underlying database errors when persistence fails', async () => {
    const req = { payload: {
      async find() { throw new Error('password=private-host-db-credential'); },
      async count() { return { totalDocs: 0 }; },
    } };
    const response = await ready(req as never);
    expect(response.status).toBe(503);
    const body = JSON.stringify(await response.json());
    expect(body).not.toContain('private-host-db-credential');
    expect(body).toContain('Database dependency unavailable');
  });

  it('reports non-critical outbox failure as degraded without declaring the CMS unavailable', async () => {
    const req = { payload: {
      async find() { return { docs: [] }; },
      async count() { throw new Error('secret-service-error'); },
    } };
    const response = await ready(req as never);
    expect(response.status).toBe(200);
    const body = JSON.stringify(await response.json());
    expect(body).toContain('degraded');
    expect(body).not.toContain('secret-service-error');
  });
});
