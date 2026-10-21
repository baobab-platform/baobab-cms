import { describe, expect, it } from 'vitest';
import { providerRun } from './int03-provider-boundary.js';

const runId = '0123456789abcdef';
const env = {
  CMS_INT03_PROVIDER: 'synthetic-disposable', BAOBAB_ENVIRONMENT: 'development', CMS_INT03_RUN_ID: runId,
  DATABASE_URL: `postgresql://cms:secret@postgres:5432/cms_int03_${runId}`,
};

describe('INT-03 provider fixture boundary', () => {
  it('accepts only the three commands over the three states', () => {
    expect(providerRun(['apply'], env)).toEqual({ command: 'apply', state: 'published', runId });
    expect(providerRun(['state', 'withdrawn'], env)).toEqual({ command: 'state', state: 'withdrawn', runId });
    expect(providerRun(['verify', 'draft'], env)).toEqual({ command: 'verify', state: 'draft', runId });
    for (const argv of [[], ['apply', 'draft'], ['state'], ['state', 'archived'], ['verify', 'published', 'x'], ['purge']]) {
      expect(() => providerRun(argv, env), argv.join(' ')).toThrow('INT03_PROVIDER_REFUSED:COMMAND');
    }
  });

  it('refuses without explicit opt-in or outside the development profile', () => {
    for (const [change, reason] of [
      [{ CMS_INT03_PROVIDER: undefined }, 'OPT_IN'], [{ CMS_INT03_PROVIDER: 'true' }, 'OPT_IN'],
      [{ BAOBAB_ENVIRONMENT: 'ci' }, 'ENVIRONMENT'], [{ BAOBAB_ENVIRONMENT: 'production' }, 'ENVIRONMENT'],
      [{ NODE_ENV: 'production' }, 'ENVIRONMENT'],
      [{ CMS_INT03_RUN_ID: 'ABCDEF0123456789' }, 'RUN_ID'], [{ CMS_INT03_RUN_ID: '0123' }, 'RUN_ID'],
      [{ S3_BUCKET: 'media' }, 'INTEGRATION'], [{ BAOBAB_IAM_OIDC_ISSUER: 'https://iam.example' }, 'INTEGRATION'],
    ] as const) {
      expect(() => providerRun(['apply'], { ...env, ...change }), JSON.stringify(change)).toThrow('INT03_PROVIDER_REFUSED:' + reason);
    }
  });

  it('selects only the database the run id names, on a local or container host', () => {
    expect(providerRun(['apply'], { ...env, DATABASE_URL: `postgresql://cms@127.0.0.1/cms_int03_${runId}` }).runId).toBe(runId);
    for (const url of [
      `postgresql://cms@postgres/cms_int03_fedcba9876543210`, `postgresql://cms@postgres/cms_pg17_qualification`,
      `postgresql://cms@cms.cluster-x.af-south-1.rds.amazonaws.com/cms_int03_${runId}`,
      `postgresql://cms@postgres/cms_int03_${runId}?sslmode=disable`, `mysql://cms@postgres/cms_int03_${runId}`,
      `postgresql://cms@postgres/cms_int03_${runId}/x`, 'not a url', '',
    ]) {
      expect(() => providerRun(['apply'], { ...env, DATABASE_URL: url }), url).toThrow('INT03_PROVIDER_REFUSED:DATABASE');
    }
  });
});
