import { expect, it } from 'vitest';
import { int03FixtureBoundary } from './fixture-boundary.js';
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
