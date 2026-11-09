import { describe, expect, it } from 'vitest';
import { validateRuntimeEnvironment } from './check-runtime-env.mjs';

const valid = {
  NODE_ENV: 'production',
  PAYLOAD_SECRET: 'bB7d290ab3af7db94206fa5c87539f8e',
  DATABASE_URL: 'postgresql://cms:secret@db.internal:5432/cms',
  S3_BUCKET: 'cms-production-media',
  CORS_ORIGIN: 'https://cms.example.org',
  CSRF_ORIGIN: 'https://cms.example.org',
  PGSSLMODE: 'require',
};
describe('ADR-0011 production configuration gate', () => {
  it('allows local development without production credentials', () =>
    expect(() => validateRuntimeEnvironment({ NODE_ENV: 'development' })).not.toThrow());
  it('permits cloud workload credentials without static S3 keys', () =>
    expect(() => validateRuntimeEnvironment(valid)).not.toThrow());
  it.each(['PAYLOAD_SECRET', 'DATABASE_URL', 'S3_BUCKET', 'CORS_ORIGIN', 'CSRF_ORIGIN'])(
    'rejects missing %s', (key) => expect(() => validateRuntimeEnvironment({ ...valid, [key]: '' })).toThrow(key));
  it('rejects default or short secrets', () => {
    expect(() => validateRuntimeEnvironment({ ...valid, PAYLOAD_SECRET: 'change-me-in-production' })).toThrow();
    expect(() => validateRuntimeEnvironment({ ...valid, PAYLOAD_SECRET: 'tiny' })).toThrow();
  });
  it.each([
    { CORS_ORIGIN: '*' },
    { CSRF_ORIGIN: 'http://cms.example.org' },
    { CORS_ORIGIN: 'https://cms.example.org/path' },
    { S3_ENDPOINT: 'http://minio:9000' },
    { PGSSLMODE: 'disable' },
    { S3_ACCESS_KEY_ID: 'minioadmin', S3_SECRET_ACCESS_KEY: 'minioadmin' },
    { S3_ACCESS_KEY_ID: 'key-only' },
  ])('rejects unsafe production settings %j', (changes) =>
    expect(() => validateRuntimeEnvironment({ ...valid, ...changes })).toThrow());
});
