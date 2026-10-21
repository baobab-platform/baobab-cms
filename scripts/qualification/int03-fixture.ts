/** Actual Payload/PG fixture lifecycle for the isolated Infrastructure provider.
 * No IAM issuance, CP issuance, registry activation or human approval occurs. */
import { isDeepStrictEqual } from 'node:util';
import { contentDataForKey } from '../../src/baobab/content-resolution/payload-source.js';
import assert from 'node:assert/strict';
import { getPayload } from 'payload';
import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { int03FixtureBoundary } from '../../src/baobab/onboarding/fixture-boundary.js';
import { createPayloadEstateRepository } from '../../src/baobab/onboarding/payload-repository.js';
import { onboardSyntheticEstate, seedSyntheticContent, setSyntheticContentState, syntheticEstateProfile } from '../../src/baobab/onboarding/estate-profile.js';

async function main() {
  const { runId, action } = int03FixtureBoundary(process.env, process.argv.slice(2));
  const { default: config } = await import('../../payload.config.js');
  const payload = await getPayload({ config });
  try {
    const version = await (payload.db as unknown as PostgresAdapter).pool.query('SHOW server_version_num');
    assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 17);
    const repo = createPayloadEstateRepository(payload);
    const profile = syntheticEstateProfile(runId);
    const options = { mode: action === 'seed' ? 'apply' as const : 'verify' as const,
      environment: 'non-production' as const, projectionMode: 'local' as const };
    assert((await onboardSyntheticEstate(repo, profile, options)).converged);
    const seeded = await seedSyntheticContent(repo, profile, options);
    assert(seeded.converged);
    if (['publish', 'withdraw', 'draft'].includes(action)) {
      await setSyntheticContentState(repo, profile, action === 'publish' ? 'published' : action === 'withdraw' ? 'withdrawn' : 'draft',
        { ...options, mode: 'apply' });
    }
    const states: Record<string, string> = {};
    for (const seed of profile.seeds) {
      const doc = await payload.findByID({ collection: seed.collection, id: seeded.ids['content-' + seed.contentKey], depth: 0, overrideAccess: true });
      assert(isDeepStrictEqual(contentDataForKey(seed.contentKey, doc as unknown as Record<string, unknown>), contentDataForKey(seed.contentKey, seed.fields)));
      states[seed.contentKey] = String('status' in doc ? doc.status : doc.publicationState);
    }
    return { schema: 'cms.int03.fixture.v1', run_id: runId, action, converged: true,
      database_version_num: Number(version.rows[0].server_version_num), states,
      canonical_references: profile.canonicalReferences, evidence_class: 'CMS_COMPONENT_SYNTHETIC_DATA',
      human_editorial_approval: false, identities_created: false, cp_issuance_proven: false,
      connected_qualification: false, full_int03_acceptance: false, production_authorized: false };
  } finally { await payload.destroy(); }
}
// Flush the bounded result before closing the adapter's reconnect-monitor
// connection with process exit; the harness separately destroys all storage.
main().then(receipt => process.stdout.write(JSON.stringify(receipt) + '\n', error => process.exit(error ? 1 : 0)),
  () => process.stderr.write('CMS_INT03_FIXTURE_FAILED\n', () => process.exit(1)));
