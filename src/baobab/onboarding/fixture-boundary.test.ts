import { expect, it } from 'vitest';
import { int03FixtureBoundary, int03ReferenceDeclaration } from './fixture-boundary.js';
const env = { CMS_INT03_RUN_ID: '0123456789abcdef', CMS_INT03_FIXTURE: 'synthetic-disposable', BAOBAB_ENVIRONMENT: 'ci',
  PAYLOAD_SECRET: 'fixture-only-'.repeat(4), DATABASE_URL: 'postgresql://payload:unused@cms-db:5432/cms_int03_0123456789abcdef' };
it('selects only the explicit disposable database before any application import', () => {
  expect(int03FixtureBoundary(env, ['seed']).runId).toBe(env.CMS_INT03_RUN_ID);
  for (const changed of [{ BAOBAB_ENVIRONMENT: 'production' }, { BAOBAB_ENVIRONMENT: 'staging' },
    { CMS_INT03_FIXTURE: undefined }, { PAYLOAD_SECRET: 'change-me-in-production' }, { CMS_INT03_RUN_ID: 'nabhold' }, { S3_BUCKET: 'business-data' },
    { BAOBAB_IAM_OIDC_ISSUER: 'https://iam.example.test' }, { DATABASE_URL: env.DATABASE_URL.replace('cms-db', 'localhost') },
    { DATABASE_URL: env.DATABASE_URL.replace('/cms_int03_', '/nabhold_') }, { DATABASE_URL: env.DATABASE_URL + '?sslmode=disable' },
    { DATABASE_URL: env.DATABASE_URL.replace('5432', '5433') }]) {
    expect(() => int03FixtureBoundary({ ...env, ...changed }, ['seed'])).toThrow();
  }
  expect(int03FixtureBoundary({ ...env, DATABASE_URL: env.DATABASE_URL.replace('cms-db', 'localhost'),
    GITHUB_ACTIONS: 'true', CMS_PG17_COMPONENT_QUALIFICATION: 'synthetic-disposable' }, ['verify']).action).toBe('verify');
  expect(() => int03FixtureBoundary(env, ['seed', 'publish'])).toThrow();
  expect(() => int03FixtureBoundary(env, ['purge'])).toThrow();
});

it('accepts only complete run-bound declarations, without establishing CP issuance', () => {
  const runId = env.CMS_INT03_RUN_ID;
  const unresolved = int03ReferenceDeclaration(undefined, runId);
  expect(new Set(Object.values(unresolved))).toEqual(new Set(['UNRESOLVED']));
  const envelope = { schema: 'cms.int03.reference-declaration.v1', run_id: runId, references: unresolved };
  expect(int03ReferenceDeclaration(JSON.stringify(envelope), runId)).toEqual(unresolved);
  // Format-only contract vectors: never supplied to a database, CP or an
  // acceptance receipt as issued identifiers.
  const references = { tenant: 'tn_contractvector', organisation: '11111111-1111-4111-8111-111111111111',
    legalEntity: '22222222-2222-4222-8222-222222222222', market: 'mkt_contractvector',
    digitalEstate: '33333333-3333-4333-8333-333333333333' };
  const valid = { ...envelope, references };
  const result = int03ReferenceDeclaration(JSON.stringify(valid), runId);
  expect(result).toEqual(references);
  expect(Object.isFrozen(result)).toBe(true);
  for (const changed of [{ ...valid, run_id: 'fedcba9876543210' }, { ...valid, schema: 'unknown' },
    { ...valid, cp_issuance_proven: true }, { ...valid, references: { ...references, tenant: 'UNRESOLVED' } },
    { ...valid, references: { ...references, market: references.organisation } },
    { ...valid, references: { ...references, digitalEstate: null } },
    { ...valid, references: { ...references, extra: 'unapproved' } }, { ...valid, references: {} }]) {
    expect(() => int03ReferenceDeclaration(JSON.stringify(changed), runId)).toThrow();
  }
  for (const raw of ['', '[]', 'null', ' '.repeat(4097), JSON.stringify(valid, null, 2),
    JSON.stringify(valid).replace('"run_id":', '"run_id":"fedcba9876543210","run_id":'),
    JSON.stringify(valid).replace('"tenant":', '"tenant":"tn_other","tenant":')]) {
    expect(() => int03ReferenceDeclaration(raw, runId)).toThrow();
  }
});

it('accepts only the exact CP DEV-05 run-bound Nabhold synthetic legal actor', () => {
  const runId = env.CMS_INT03_RUN_ID;
  const references = {
    tenant: 'tn_contractvector',
    organisation: '11111111-1111-4111-8111-111111111111',
    legalEntity: 'DEV-' + runId.slice(0, 12) + '-NABHOLD',
    market: 'mkt_dev' + runId + 'za',
    digitalEstate: '33333333-3333-4333-8333-333333333333',
  };
  const declaration = (refs: typeof references) => JSON.stringify({
    schema: 'cms.int03.reference-declaration.v1', run_id: runId, references: refs,
  });
  // This assertion does not claim the fixture actually came from CP: only
  // the runner's signed/current CP readback can establish issuance.
  expect(int03ReferenceDeclaration(declaration(references), runId)).toEqual(references);
  for (const invalid of [
    'DEV-' + 'f'.repeat(12) + '-NABHOLD',
    'DEV-' + runId.slice(0, 12) + '-THAMANI',
    'DEV-' + runId.slice(0, 12) + '-NABHOLD-EXT',
    'DEV-' + runId.slice(0, 12) + '-nabhold',
  ]) {
    expect(() => int03ReferenceDeclaration(declaration({ ...references, legalEntity: invalid }), runId)).toThrow();
  }
  expect(() => int03ReferenceDeclaration(declaration(references), 'fedcba9876543210')).toThrow();
});
