/** CMS-owned fixture control for the disposable INT-03 provider (Infrastructure).
 *
 *   apply                          fresh database only: Nabhold draft estate as
 *                                  the unchanged neighbour, then the synthetic
 *                                  estate, published as disposable fixtures
 *   state  published|withdrawn|draft
 *   verify published|withdrawn|draft
 *
 * Every write goes through actual Payload collection hooks. Fixture
 * publication is CMS-owned test data, never human editorial approval, and
 * this command never creates a principal, credential, grant or domain.
 * Canonical CP references stay UNRESOLVED: nothing here mints them.
 *
 * providerRun refuses everything but the provider's own disposable database,
 * before any import of Payload config. Teardown of that database is the
 * provider's job.
 */
import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { getPayload, type Payload } from 'payload';
import { NABHOLD, onboardEstate } from '../../src/baobab/onboarding/nabhold.js';
import { seedNabholdContent } from '../../src/baobab/onboarding/nabhold-content.js';
import {
  onboardSyntheticEstate, seedSyntheticContent, setSyntheticContentState, syntheticEstateProfile,
  type SyntheticEstateProfile,
} from '../../src/baobab/onboarding/estate-profile.js';
import { providerRun, type ProviderRun } from '../../src/baobab/onboarding/int03-provider-boundary.js';
import { payloadRepository, type Row } from './payload-repository.js';

const OPTIONS = { environment: 'non-production', projectionMode: 'local' } as const;

async function main() {
  const run = providerRun(process.argv.slice(2), process.env);
  const { default: config } = await import('../../payload.config.js');
  const payload = await getPayload({ config });
  try {
    const version = await (payload.db as unknown as PostgresAdapter).pool.query('SHOW server_version_num');
    assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 17);
    return await execute(payload, run, syntheticEstateProfile(run.runId));
  } finally {
    await payload.destroy();
  }
}

async function execute(payload: Payload, run: ProviderRun, profile: SyntheticEstateProfile) {
  const { find, repo } = payloadRepository(payload);
  const apply = { ...OPTIONS, mode: 'apply' as const };
  const verify = { ...OPTIONS, mode: 'verify' as const };
  // The neighbour estate's complete content rows; they must never change.
  const nabholdRows = async () => {
    const [tenant] = await find('tenants', { code: { equals: 'nabhold' } }, 2);
    assert(tenant);
    return [...await find('pages', { tenant: { equals: tenant.id } }, 50),
      ...await find('site-configurations', { tenant: { equals: tenant.id } }, 50)] as Row[];
  };

  if (run.command === 'apply') {
    // A reused database cannot stand in for a fresh disposable provider.
    assert.equal((await payload.count({ collection: 'tenants', overrideAccess: true })).totalDocs, 0);
    // Nabhold's draft estate is the neighbour that must stay unchanged. Its
    // local workload user is left out: INT-03 creates no principal of any kind.
    assert((await onboardEstate(repo, { ...NABHOLD, serviceEmail: undefined }, { ...apply, generateSecret: () => { throw new Error('No workload user in INT-03'); } })).converged);
    assert((await seedNabholdContent(repo, apply)).converged);
    assert((await onboardSyntheticEstate(repo, profile, apply)).converged);
    assert((await seedSyntheticContent(repo, profile, apply)).converged);
    // Idempotent: a second seed creates nothing.
    assert((await seedSyntheticContent(repo, profile, apply)).steps.every(s => s.action === 'exists'));
  }
  if (run.command !== 'verify') {
    const before = await nabholdRows();
    const result = await setSyntheticContentState(repo, profile, run.state, apply);
    assert.equal(result.humanEditorialApproval, false);
    assert(isDeepStrictEqual(await nabholdRows(), before));
  }

  // Verify in every command; `verify` runs in a separate process for persistence.
  assert((await onboardSyntheticEstate(repo, profile, verify)).converged);
  const seeded = await seedSyntheticContent(repo, profile, verify);
  assert(seeded.converged);
  for (const seed of profile.seeds) {
    const row = await payload.findByID({ collection: seed.collection as 'pages', id: seeded.ids['content-' + seed.contentKey],
      depth: 0, overrideAccess: true }) as unknown as Row;
    assert.equal(seed.collection === 'pages' ? row.status : row.publicationState, seed.collection === 'pages'
      ? (run.state === 'withdrawn' ? 'archived' : run.state)
      : (run.state === 'published' ? 'PUBLISHED' : run.state === 'withdrawn' ? 'UNPUBLISHED' : 'DRAFT'));
  }
  const [organisation] = await find('organisations', { code: { equals: profile.organisationCode } }, 2);
  assert.equal(organisation.canonicalLegalEntityId, null);
  assert.equal(organisation.controlPlaneOrganisationId, null);
  // Nabhold stays draft-only whatever happens to the fixtures.
  assert((await seedNabholdContent(repo, verify)).converged);
  for (const row of await nabholdRows()) assert(row.status === 'draft' || row.publicationState === 'DRAFT');

  return {
    schema: 'cms.int03.provider-fixture.v1', command: run.command, state: run.state,
    namespace: { tenant: profile.tenantCode, organisation: profile.organisationCode, market: profile.marketCode,
      estate: profile.estateCode, locale: profile.locale },
    content_keys: profile.seeds.map(s => s.contentKey),
    canonical_references: profile.canonicalReferences,
    evidence_class: 'CMS_OWNED_DISPOSABLE_FIXTURE', human_editorial_approval: false,
    neighbour_estate_unchanged: true, connected_qualification: false,
  };
}

// As pg17-content.ts: flush the bounded receipt after Payload cleanup, then
// exit (the adapter's reconnect monitor would hold the event loop open). Only
// fixed codes leave the process, never assertion, SQL or credential text.
main().then(
  receipt => process.stdout.write(JSON.stringify(receipt) + '\n', error => process.exit(error ? 1 : 0)),
  error => {
    const fixed = /^(SYNTHETIC_FIXTURE_CHANGED:(home|navigation|footer|site-settings|group-profile)|INT03_PROVIDER_REFUSED:[A-Z_]+)$/;
    const code = error instanceof Error && fixed.test(error.message) ? error.message : 'CMS_INT03_PROVIDER_FIXTURE_FAILED';
    process.stderr.write(code + '\n', () => process.exit(1));
  },
);
