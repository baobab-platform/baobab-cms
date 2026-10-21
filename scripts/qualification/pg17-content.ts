/** Real Payload/PostgreSQL component checks, never a live IAM/CP receipt.
 * Writes only to the explicitly named disposable loopback CI database. All
 * ordinary content mutations run through the real collection hooks; synthetic
 * local actors are deliberate test fixtures, not authenticated IAM identities.
 */
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { PostgresAdapter } from '@payloadcms/db-postgres';
import { getPayload, type CollectionSlug, type Payload, type Where } from 'payload';
import { SYSTEM_ACTOR } from '../../src/baobab/context/system-actor.js';
import { onboardNabhold, type ProjectionRepository } from '../../src/baobab/onboarding/nabhold.js';
import { seedNabholdContent, type ContentSeedRepository } from '../../src/baobab/onboarding/nabhold-content.js';

type Row = Record<string, unknown> & { id: string };

async function main() {
  // Check every destructive-test boundary before importing application config
  // or opening a database. A CI flag alone must not select an arbitrary server.
  const mode = process.argv[2];
  const database = new URL(process.env.DATABASE_URL ?? '');
  assert(['apply', 'verify'].includes(mode));
  assert.equal(process.argv.length, 3);
  assert.equal(process.env.CMS_PG17_COMPONENT_QUALIFICATION, 'synthetic-disposable');
  assert.equal(process.env.BAOBAB_ENVIRONMENT, 'ci');
  assert.equal(database.protocol, 'postgresql:');
  assert(['localhost', '127.0.0.1', '[::1]'].includes(database.hostname));
  assert.equal(database.pathname, '/cms_pg17_qualification');
  assert.equal(database.search, '');
  assert.equal(database.hash, '');
  assert(!process.env.S3_ENDPOINT && !process.env.S3_BUCKET && !process.env.BAOBAB_IAM_OIDC_ISSUER);
  const { default: config } = await import('../../payload.config.js');
  const payload = await getPayload({ config });
  const pool = (payload.db as unknown as PostgresAdapter).pool;
  try {
    const version = await pool.query('SHOW server_version_num');
    assert.equal(Math.floor(Number(version.rows[0].server_version_num) / 10000), 17);
    await check(payload, mode);
  } finally {
    await payload.destroy();
  }
  return { schema: 'cms.pg17.component-check.v1', mode, passed: true,
    evidence_class: 'COMPONENT_SYNTHETIC_DATA', live_iam_cp_proven: false,
    cms_provider_qualified: false, full_int03_accepted: false, production_authorized: false };
}


async function check(payload: Payload, mode: string) {
  const find = async (collection: string, where: Where, limit: number) =>
    (await payload.find({ collection: collection as CollectionSlug, where, limit, depth: 0, overrideAccess: true })).docs as unknown as Row[];
  const repo: ProjectionRepository & ContentSeedRepository = {
    find: (collection, field, value, limit) => find(collection, { [field]: { equals: value } }, limit),
    findScoped: (collection, tenant, contentKey, kind) => find(collection, { and: [
      { tenant: { equals: tenant } }, { contentKey: { equals: contentKey } }, ...(kind ? [{ kind: { equals: kind } }] : []),
    ] }, 3),
    create: async (collection, data) => await payload.create({ collection: collection as CollectionSlug,
      data: data as never, user: SYSTEM_ACTOR as never, overrideAccess: true }) as unknown as Row,
    update: async (collection, id, data) => await payload.update({ collection: collection as CollectionSlug,
      id, data: data as never, user: SYSTEM_ACTOR as never, overrideAccess: true }) as unknown as Row,
  };
  const options = { environment: 'non-production' as const, projectionMode: 'local' as const };
  if (mode === 'apply') {
    // A reused or previously seeded database cannot claim the fresh-migration case.
    assert.equal((await payload.count({ collection: 'tenants', overrideAccess: true })).totalDocs, 0);
    const onboarding = await onboardNabhold(repo, { ...options, mode: 'apply', generateSecret: () => randomBytes(48).toString('base64url') });
    assert(onboarding.converged);
    const first = await seedNabholdContent(repo, { ...options, mode: 'apply' });
    assert(first.converged);
    assert.equal(first.steps.filter(s => s.action === 'create').length, 5);
    const second = await seedNabholdContent(repo, { ...options, mode: 'apply' });
    assert(second.converged);
    assert(second.steps.every(s => s.action === 'exists'));
    assert.deepEqual(second.ids, first.ids);
  }
  const seeded = await seedNabholdContent(repo, { ...options, mode: 'verify' });
  assert(seeded.converged);
  const tenants = await find('tenants', { code: { equals: 'nabhold' } }, 2);
  assert.equal(tenants.length, 1);
  const tenant = tenants[0].id;
  const home = await payload.findByID({ collection: 'pages', id: seeded.ids['content-home'], depth: 0, overrideAccess: true });
  assert.equal(home.status, 'draft');
  for (const kind of ['navigation', 'footer', 'site-settings', 'group-profile']) {
    const rows = await repo.findScoped('site-configurations', tenant, kind, kind);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].publicationState, 'DRAFT');
  }
  // These are Content Engine local actor projections for component testing.
  // They prove actual SQL filtering/hooks only, never a live SSO/CP admission.
  const actor = { id: 'synthetic-editor', tenantId: tenant, canonicalActorId: 'synthetic-editor',
    editorialRoles: [], capabilities: ['content.management', 'content.publish'] };
  for (const status of ['published', 'archived']) {
    await assert.rejects(payload.update({ collection: 'pages', id: home.id, data: { status: status as 'published' },
      user: actor as never, overrideAccess: false }), { name: 'PublicationDeniedError' });
  }
  await assert.rejects(payload.delete({ collection: 'pages', id: home.id, user: actor as never, overrideAccess: false }),
    { name: 'PublicationDeniedError' });
  const otherTenant = { ...actor, tenantId: randomUUID(), editorialRoles: ['CONTENT_ADMINISTRATOR'] };
  const denied = await payload.find({ collection: 'pages', user: otherTenant as never, overrideAccess: false });
  assert.equal(denied.totalDocs, 0);
  const reread = await payload.findByID({ collection: 'pages', id: home.id, depth: 0, overrideAccess: true });
  assert.equal(reread.status, 'draft');
  assert.equal(reread.updatedAt, home.updatedAt);
}

// Like the repository's other standalone Payload CLIs, terminate after awaited
// Payload cleanup. The adapter retains a dedicated reconnect-monitor connection;
// pool.end() would wait forever for that deliberately checked-out client. Process
// exit closes its sockets; CI separately destroys the disposable database service.
// Flush the bounded result first; no PASS is exported before all assertions and
// Payload destroy complete. A failed write or assertion exits nonzero.
main().then(
  receipt => process.stdout.write(JSON.stringify(receipt) + '\n', error => process.exit(error ? 1 : 0)),
  () => process.stderr.write('CMS_PG17_COMPONENT_CHECK_FAILED\n', () => process.exit(1)),
);
