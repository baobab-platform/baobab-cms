#!/usr/bin/env tsx
/**
 * Control Plane reconciliation report for the Nabhold estate. Read-only; changes nothing.
 *
 *   tsx scripts/reconcile/nabhold-cp.ts                 # JSON
 *   tsx scripts/reconcile/nabhold-cp.ts --format text
 *   tsx scripts/reconcile/nabhold-cp.ts --strict        # exit 1 if any finding is BLOCKED
 *
 * Optional: CONTROL_PLANE_URL and CMS_CP_READ_TOKEN let it read the tenant from the Control Plane. Without them those
 * checks say "not attempted". No secret is printed.
 */
import { readFileSync } from 'node:fs';
import { getPayload } from 'payload';
import config from '../../payload.config.js';
import { NABHOLD } from '../../src/baobab/onboarding/nabhold.js';
import { observeControlPlaneTenant } from '../../src/baobab/reconciliation/control-plane-reader.js';
import {
  REQUIRED_ROUTE_CONFIG,
  buildReconciliationReport,
  renderText,
  type CmsSnapshot,
  type UpstreamItem,
} from '../../src/baobab/reconciliation/nabhold-cp.js';

const args = process.argv.slice(2);
const text = args.includes('--format') && args[args.indexOf('--format') + 1] === 'text';
const strict = args.includes('--strict');

async function main(): Promise<number> {
  const payload = await getPayload({ config });
  const find = async (collection: string, where: Record<string, unknown>, limit = 100) =>
    (await payload.find({ collection: collection as 'pages', where: where as never, limit, depth: 0, overrideAccess: true })).docs as unknown as Array<
      Record<string, unknown> & { id: string }
    >;

  const tenant = (await find('tenants', { code: { equals: NABHOLD.tenantCode } }, 2))[0];
  const tenantFilter = tenant ? { tenant: { equals: tenant.id } } : { id: { equals: '__none__' } };
  const organisation = (await find('organisations', { code: { equals: NABHOLD.organisationCode } }, 2))[0];
  const pages = await find('pages', { and: [tenantFilter, { contentKey: { in: ['home'] } }] });
  const configs = await find('site-configurations', tenantFilter);
  const users = await find('users', { tenantId: { equals: tenant ? String(tenant.id) : '__none__' } });

  const counts: Record<string, number> = {};
  for (const status of ['PENDING', 'PUBLISHING', 'PUBLISHED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL']) {
    counts[status] = (await payload.count({ collection: 'outbox', where: { status: { equals: status } }, overrideAccess: true })).totalDocs;
  }

  const provider = readFileSync(new URL('../../.baobab/capability-provider.yaml', import.meta.url), 'utf8');
  const support = /capability_key:\s*content\.entry\.resolve[\s\S]*?implementation_status:\s*([A-Z_]+)/.exec(
    provider.slice(provider.indexOf('support:') >= 0 ? provider.indexOf('support:') : 0),
  );

  const snapshot: CmsSnapshot = {
    tenant,
    organisation,
    markets: await find('markets', tenantFilter),
    estates: await find('digital-estates', tenantFilter),
    content: [
      ...pages.map((p) => ({ key: String(p.contentKey), state: String(p.status) })),
      ...configs.map((c) => ({ key: String(c.contentKey), state: String(c.publicationState) })),
    ],
    workloadIdentities: users.filter((u) => u.serviceIdentity === true),
    humanEditorCount: users.filter((u) => u.serviceIdentity !== true).length,
    outbox: counts,
    routeConfigPresent: Object.fromEntries(REQUIRED_ROUTE_CONFIG.map((k) => [k, Boolean(process.env[k])])),
    providerSupport: support ? { capability: 'content.entry.resolve', implementationStatus: support[1] } : null,
  };

  const controlPlane = await observeControlPlaneTenant({
    baseUrl: process.env.CONTROL_PLANE_URL,
    token: process.env.CMS_CP_READ_TOKEN,
    tenantId: typeof tenant?.controlPlaneTenantId === 'string' ? tenant.controlPlaneTenantId : undefined,
  });

  const upstream = (
    JSON.parse(readFileSync(new URL('../../docs/operations/nabhold-upstream-dependencies.json', import.meta.url), 'utf8')) as {
      items: UpstreamItem[];
    }
  ).items;

  const report = buildReconciliationReport({ snapshot, controlPlane, upstream });
  console.log(text ? renderText(report) : JSON.stringify(report, null, 2));
  return strict && report.summary.BLOCKED > 0 ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('Reconciliation failed:', error instanceof Error ? error.message : 'unknown error');
    process.exit(2);
  },
);
