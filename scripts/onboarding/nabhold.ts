#!/usr/bin/env tsx
/**
 * Nabhold Group Africa corporate-estate onboarding (CMS projection set).
 *
 *   tsx scripts/onboarding/nabhold.ts                       # dry-run (default), writes nothing
 *   tsx scripts/onboarding/nabhold.ts --verify              # read-only; exit 1 unless converged
 *   tsx scripts/onboarding/nabhold.ts --apply --projection-mode local
 *   Optional: --domain <host> (repeatable, approved hostnames only)
 *             --control-plane-organisation-id <uuid> (the PRIMARY Organisation UUID, from a Control Plane issuance; fills a blank value only)
 *             --control-plane-tenant-id <tn_...> (from a Control Plane issuance; fills a blank value only)
 *
 * Decision logic lives in src/baobab/onboarding/nabhold.ts (unit tested).
 * See docs/operations/onboard-nabhold.md. No secret is ever printed.
 */
import { randomBytes } from 'node:crypto';
import { getPayload } from 'payload';
import config from '../../payload.config.js';
import { SYSTEM_ACTOR } from '../../src/baobab/context/system-actor.js';
import {
  detectEnvironment,
  onboardNabhold,
  type Mode,
  type ProjectionRepository,
} from '../../src/baobab/onboarding/nabhold.js';

function parseArgs(argv: string[]) {
  const modes: Mode[] = [];
  let projectionMode: 'local' | 'none' = 'none';
  const domains: string[] = [];
  let controlPlaneTenantId: string | undefined;
  let controlPlaneOrganisationId: string | undefined;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--apply') modes.push('apply');
    else if (arg === '--verify') modes.push('verify');
    else if (arg === '--dry-run') modes.push('dry-run');
    else if (arg === '--projection-mode') {
      const value = argv[++i];
      if (value !== 'local') throw new Error('--projection-mode only supports "local"');
      projectionMode = 'local';
    } else if (arg === '--control-plane-tenant-id') {
      controlPlaneTenantId = argv[++i];
    } else if (arg === '--control-plane-organisation-id') {
      controlPlaneOrganisationId = argv[++i];
    } else if (arg === '--domain') {
      const value = argv[++i];
      if (!value || !/^[a-z0-9.-]+$/.test(value)) throw new Error('--domain needs a lowercase hostname');
      domains.push(value);
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (modes.length > 1) throw new Error('Choose only one of --dry-run, --apply, --verify');
  return { mode: modes[0] ?? 'dry-run', projectionMode, domains, controlPlaneTenantId, controlPlaneOrganisationId };
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  const payload = await getPayload({ config });

  const repo: ProjectionRepository = {
    async find(collection, field, value, limit) {
      const result = await payload.find({
        collection: collection as 'tenants',
        where: { [field]: { equals: value } },
        limit,
        depth: 0,
        overrideAccess: true,
      });
      return result.docs as never;
    },
    async create(collection, data) {
      const doc = await payload.create({
        collection: collection as 'tenants',
        data: data as never,
        user: SYSTEM_ACTOR as never,
        overrideAccess: true,
      });
      return doc as never;
    },
    async update(collection, id, data) {
      const doc = await payload.update({
        collection: collection as 'tenants',
        id,
        data: data as never,
        user: SYSTEM_ACTOR as never,
        overrideAccess: true,
      });
      return doc as never;
    },
  };

  const report = await onboardNabhold(repo, {
    mode: args.mode,
    projectionMode: args.projectionMode,
    environment: detectEnvironment(process.env),
    approvedDomains: args.domains,
    controlPlaneTenantId: args.controlPlaneTenantId,
    controlPlaneOrganisationId: args.controlPlaneOrganisationId,
    generateSecret: () => randomBytes(48).toString('base64url'),
  });

  console.log(JSON.stringify(report, null, 2));
  const ok = args.mode === 'dry-run' ? report.blockers.length === 0 : report.converged;
  return ok ? 0 : 1;
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error('Nabhold onboarding failed:', error instanceof Error ? error.message : 'unknown error');
    process.exit(2);
  },
);
