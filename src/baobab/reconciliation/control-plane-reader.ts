import type { ControlPlaneObservation } from './nabhold-cp.js';

/**
 * Read-only view of a Control Plane tenant (GET /v1/tenants/{tenant_id}). Needs a workload token with read
 * authority; without one the report records "not attempted" rather than guessing. The token is never logged.
 */
export async function observeControlPlaneTenant(params: {
  baseUrl?: string;
  token?: string;
  tenantId?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}): Promise<ControlPlaneObservation> {
  if (!params.tenantId) return { status: 'not_attempted', reason: 'no Control Plane tenant id in the projection' };
  if (!params.baseUrl || !params.token) return { status: 'not_attempted', reason: 'no Control Plane URL or read credential configured' };
  if (!/^tn_[a-z0-9]+$/.test(params.tenantId)) return { status: 'not_attempted', reason: 'the projected tenant id is malformed' };

  let res: Response;
  try {
    res = await (params.fetchImpl ?? fetch)(`${params.baseUrl.replace(/\/+$/, '')}/v1/tenants/${params.tenantId}`, {
      headers: { authorization: `Bearer ${params.token}`, accept: 'application/json' },
      signal: AbortSignal.timeout(params.timeoutMs ?? 5000),
      redirect: 'error',
    });
  } catch {
    return { status: 'unavailable', reason: 'the Control Plane could not be reached' };
  }
  if (res.status === 404) return { status: 'not_found' };
  if (res.status === 401 || res.status === 403) return { status: 'unavailable', reason: `the Control Plane refused the read credential (${res.status})` };
  if (!res.ok) return { status: 'unavailable', reason: `the Control Plane answered ${res.status}` };

  let body: Record<string, unknown>;
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    return { status: 'unavailable', reason: 'the Control Plane answer was not valid JSON' };
  }
  if (typeof body.tenant_id !== 'string') return { status: 'unavailable', reason: 'the Control Plane answer did not name a tenant' };
  const s = (v: unknown) => (typeof v === 'string' ? v : undefined);
  return {
    status: 'found',
    tenant: {
      tenantId: body.tenant_id,
      desiredState: s(body.desired_state),
      observedState: s(body.observed_state),
      legalEntityId: s(body.legal_entity_id),
      organisationId: s(body.organisation_id),
    },
  };
}
