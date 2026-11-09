import type { Endpoint, PayloadRequest } from 'payload';
import { summarizeHealth, type DependencyHealth } from './health.js';

async function checkDatabase(req: PayloadRequest): Promise<DependencyHealth> {
  try {
    // Health must actually exercise persistence, not be short-circuited by
    // anonymous tenant collection access (ADR-0020 §52-55).
    await req.payload.find({ collection: 'tenants', limit: 1, depth: 0, overrideAccess: true, req });
    return { name: 'database', status: 'ok', critical: true };
  } catch {
    return {
      name: 'database',
      status: 'unavailable',
      critical: true,
      detail: 'Database dependency unavailable',
    };
  }
}

async function checkOutboxBacklog(req: PayloadRequest): Promise<DependencyHealth> {
  try {
    const backlog = await req.payload.count({
      collection: 'outbox',
      where: { status: { in: ['FAILED_RETRYABLE', 'FAILED_TERMINAL'] } },
      overrideAccess: true,
      req,
    });
    // A growing backlog is a degraded signal, never a reason to report the
    // whole engine unavailable — reads/writes of authoritative content
    // remain unaffected by event-transport trouble (ADR-0018 §91, ADR-0020 §55).
    const status = backlog.totalDocs > 100 ? 'degraded' : 'ok';
    return { name: 'outbox', status, critical: false, detail: `${backlog.totalDocs} failed/retrying` };
  } catch (error) {
    return {
      name: 'outbox',
      status: 'degraded',
      critical: false,
      detail: 'Outbox state unavailable',
    };
  }
}

/**
 * Liveness/readiness/dependency endpoints (ADR-0020 §52-56). Liveness
 * never touches the database — it only proves the process is responsive.
 * Readiness checks dependencies and distinguishes degraded from
 * unavailable, per ADR-0020 §50 ("Do not mark the entire Content Engine
 * unhealthy merely because a non-critical... integration is unavailable").
 */
export const healthEndpoints: Endpoint[] = [
  {
    path: '/health/live',
    method: 'get',
    handler: async () => Response.json({ status: 'alive', timestamp: new Date().toISOString() }),
  },
  {
    path: '/health/ready',
    method: 'get',
    handler: async (req) => {
      const dependencies = await Promise.all([checkDatabase(req), checkOutboxBacklog(req)]);
      const report = summarizeHealth(dependencies);
      const httpStatus = report.status === 'unavailable' ? 503 : 200;
      return Response.json(report, { status: httpStatus });
    },
  },
];
