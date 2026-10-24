/** Actual Payload/PG fixture lifecycle for the isolated Infrastructure provider.
 * No IAM issuance, CP issuance, registry activation or human approval occurs. */
import { isDeepStrictEqual } from 'node:util';
import { contentDataForKey } from '../../src/baobab/content-resolution/payload-source.js';
import assert from 'node:assert/strict';
import { getPayload } from 'payload';
import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { int03FixtureBoundary, int03ReferenceDeclaration } from '../../src/baobab/onboarding/fixture-boundary.js';
import { createPayloadEstateRepository } from '../../src/baobab/onboarding/payload-repository.js';
import { onboardSyntheticEstate, seedSyntheticContent, setSyntheticContentState, syntheticEstateProfile } from '../../src/baobab/onboarding/estate-profile.js';

// Only fixed phase names are reported to the integrating runner. Raw Payload, SQL,
// identity and provider errors may contain credentials or protected data.
const PHASES = ['BOUNDARY', 'REFERENCE_DECLARATION', 'PAYLOAD_INIT', 'PG17_CHECK',
  'ESTATE_PROJECTION', 'CONTENT_SEED', 'PUBLICATION', 'READBACK', 'DESTROY'] as const;
let failurePhase: typeof PHASES[number] = 'BOUNDARY';

async function main() {
  const { runId, action } = int03FixtureBoundary(process.env, process.argv.slice(2));
  failurePhase = 'REFERENCE_DECLARATION';
  const references = int03ReferenceDeclaration(process.env.CMS_INT03_REFERENCE_DECLARATION, runId);
  failurePhase = 'PAYLOAD_INIT';
  const { default: config } = await import('../../payload.config.js');
  const payload = await getPayload({ config });
  let failed = false;
  try {
    failurePhase = 'PG17_CHECK';
    const version = await (payload.db as unknown as PostgresAdapter).pool.query('SHOW server_version_num');
    assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 17);
    const repo = createPayloadEstateRepository(payload);
    const profile = syntheticEstateProfile(runId, references);
    const options = { mode: action === 'seed' ? 'apply' as const : 'verify' as const,
      environment: 'non-production' as const, projectionMode: 'local' as const };
    failurePhase = 'ESTATE_PROJECTION';
    assert((await onboardSyntheticEstate(repo, profile, options)).converged);
    failurePhase = 'CONTENT_SEED';
    const seeded = await seedSyntheticContent(repo, profile, options);
    assert(seeded.converged);
    failurePhase = 'PUBLICATION';
    if (['publish', 'withdraw', 'draft'].includes(action)) {
      await setSyntheticContentState(repo, profile, action === 'publish' ? 'published' : action === 'withdraw' ? 'withdrawn' : 'draft',
        { ...options, mode: 'apply' });
    }
    failurePhase = 'READBACK';
    const states: Record<string, string> = {};
    for (const seed of profile.seeds) {
      const doc = await payload.findByID({ collection: seed.collection, id: seeded.ids['content-' + seed.contentKey], depth: 0, overrideAccess: true });
      const record = doc as unknown as Record<string, unknown>;
      assert(isDeepStrictEqual(contentDataForKey(seed.contentKey, record), contentDataForKey(seed.contentKey, seed.fields)));
      const state = record[seed.collection === 'pages' ? 'status' : 'publicationState'];
      assert(typeof state === 'string' && (seed.collection === 'pages'
        ? ['draft', 'published', 'archived'] : ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED']).includes(state));
      states[seed.contentKey] = state;
    }
    return { schema: 'cms.int03.fixture.v1', run_id: runId, action, converged: true,
      database_version_num: Number(version.rows[0].server_version_num), states,
      canonical_references: profile.canonicalReferences, evidence_class: 'CMS_COMPONENT_SYNTHETIC_DATA',
      reference_source: Object.values(references).every(reference => reference === 'UNRESOLVED')
        ? 'UNRESOLVED' : 'EXTERNAL_DECLARATION_NOT_VERIFIED',
      human_editorial_approval: false, identities_created: false, cp_issuance_proven: false,
      connected_qualification: false, full_int03_acceptance: false, production_authorized: false };
  } catch (error) {
    failed = true;
    throw error;
  } finally {
    // A failed operation keeps its original phase even if cleanup succeeds.
    if (!failed) failurePhase = 'DESTROY';
    await payload.destroy();
  }
}
// Flush the bounded result before closing the adapter's reconnect-monitor
// connection with process exit; the harness separately destroys all storage.
main().then(receipt => process.stdout.write(JSON.stringify(receipt) + '\n', error => process.exit(error ? 1 : 0)),
  () => process.stderr.write('CMS_INT03_STAGE_FAILED=' + failurePhase + '\n', () => process.exit(1)));
